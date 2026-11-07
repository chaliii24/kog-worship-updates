// Which LAN address the phone remote should be told to connect to.
//
// A phone can only reach the remote if the URL points at the adapter that sits
// on the same network as the phone. That is not the same thing as "the first
// private IPv4", which is what the old name-guess did: an operator's Windows
// box routinely has several at once — Hyper-V / WSL / Docker virtual switches
// on 172.16/12, a VirtualBox host-only adapter on 192.168.56, a VPN on 10.8.x —
// and os.networkInterfaces() returns them in no useful order. Printing the
// wrong one is why packaged builds showed a class-B 172.x address that no phone
// on the church Wi-Fi could route to, while a dev run happened to print the
// real 192.168.x Wi-Fi.
//
// Three layers decide it now, in order of trust:
//
//   1. ROUTE PROBE (probeRouteAddress) — ask the OS which source address it
//      would use to leave the machine. A UDP connect() transmits nothing; it
//      only makes the kernel resolve a route and fill in the local address.
//      That adapter owns the default gateway, so it is the one a phone sharing
//      the LAN can actually reach.
//   2. RANKING (listAddresses) — for offline networks and no-gateway setups,
//      score each adapter by name and by range, discounting virtual switches.
//   3. PIN — the operator can force an adapter. Rarely needed (dual-homed PC,
//      hotspot plus wired), but it must be possible.
//
// Everything here is pure except probeRouteAddress(): no Electron, no logging,
// so the ranking can be unit-tested against fixture interface tables.
import os from 'os';
import dgram from 'dgram';

// Adapters that exist inside the machine and can never be reached from a phone
// on the hall's Wi-Fi. `vEthernet` is Hyper-V/WSL, `vmnet`/`vboxnet` are the
// desktop VM host-only switches, `tun`/`tap`/`wg` are tunnels.
const VIRTUAL_NAME = /(vpn|wireguard|openvpn|tailscale|zerotier|hamachi|radmin|npcap|virtualbox|vboxnet|vmware|vmnet|hyper-?v|vethernet|docker|wsl|tun\d|tap\d|wg\d|bluetooth|wi-?fi direct|local area connection\*|pseudo|loopback|teredo|isatap|virtual)/i;

// Names that usually mean a real cable or radio to the room.
const PHYSICAL_NAME = /(wi-?fi|wireless|wlan|ethernet|lan|local area)/i;

/** RFC1918 (plus what Windows calls "private") IPv4. */
export const isPrivateV4 = (address) =>
  /^10\./.test(address) || /^192\.168\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);

/**
 * Higher is better. The penalties matter more than the bonuses: a virtual
 * switch that is *also* on 172.x has to lose to any real adapter, and an APIPA
 * (169.254) address has to lose to everything — it means DHCP failed and
 * nothing is reachable through it.
 */
export function scoreAddress(name, address) {
  const ifName = String(name || '');
  let score = 0;

  if (VIRTUAL_NAME.test(ifName)) score -= 200;
  if (PHYSICAL_NAME.test(ifName)) score += 30;
  if (/wi-?fi|wireless|wlan/i.test(ifName)) score += 10;

  if (/^169\.254\./.test(address)) score -= 400;          // APIPA: DHCP never answered
  if (/^192\.168\.(56|99)\./.test(address)) score -= 120; // VirtualBox / docker-machine defaults
  if (/^172\.(1[7-9]|2\d|3[01])\./.test(address)) score -= 40; // Hyper-V / WSL / docker default range

  if (/^192\.168\./.test(address)) score += 15;           // the ordinary home/church LAN
  else if (/^10\./.test(address)) score += 10;            // corporate / mesh, often real
  else if (isPrivateV4(address)) score += 5;

  return score;
}

/** Every non-internal IPv4 with its adapter, best first. */
export function listAddresses(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const name of Object.keys(interfaces || {})) {
    for (const info of interfaces[name] || []) {
      if (!info || info.family !== 'IPv4' || info.internal) continue;
      out.push({
        name,
        address: info.address,
        virtual: VIRTUAL_NAME.test(String(name || '')),
        score: scoreAddress(name, info.address),
      });
    }
  }
  out.sort((a, b) => b.score - a.score || String(a.address).localeCompare(String(b.address)));
  return out;
}

/**
 * The address the links are built from.
 *
 * `pinned` wins while it still exists (the operator knows their room), then the
 * route probe, then the ranking. A stale pin or probe is ignored rather than
 * printed: that is what keeps a laptop which moved from church to home from
 * handing out an address that no longer exists on this network.
 */
export function pickAddress({ addresses = [], probed = '', pinned = '' } = {}) {
  const live = (address) => !!address && addresses.some((a) => a.address === address);
  if (live(pinned)) return pinned;
  if (live(probed)) return probed;
  return addresses.length ? addresses[0].address : '127.0.0.1';
}

/**
 * The local address the OS would use to leave the machine.
 *
 * UDP connect() writes no packet: it only installs the peer on the socket, and
 * the kernel picks the source address from the routing table. 1.1.1.1 is used
 * because it is never a LAN-resident address we might confuse for ourselves.
 * Resolves '' when there is no default route (an isolated hall switch), which
 * leaves the ranking in charge.
 */
export function probeRouteAddress(timeoutMs = 400) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ip) => {
      if (done) return;
      done = true;
      resolve(ip || '');
    };
    let sock;
    try {
      sock = dgram.createSocket('udp4');
    } catch {
      finish('');
      return;
    }
    const timer = setTimeout(() => {
      try { sock.close(); } catch { /* noop */ }
      finish('');
    }, timeoutMs);
    const close = () => {
      clearTimeout(timer);
      try { sock.close(); } catch { /* noop */ }
    };
    sock.on('error', () => { close(); finish(''); });
    try {
      sock.connect(53, '1.1.1.1', () => {
        let ip = '';
        try { ip = sock.address().address; } catch { /* noop */ }
        close();
        // 0.0.0.0 means the kernel could not commit to a source address.
        finish(ip === '0.0.0.0' ? '' : ip);
      });
    } catch {
      close();
      finish('');
    }
  });
}
