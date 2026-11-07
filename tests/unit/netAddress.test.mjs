import test from 'node:test';
import assert from 'node:assert/strict';
import { listAddresses, pickAddress, scoreAddress, isPrivateV4 } from '../../electron/netAddress.js';

// A Windows operator machine as it actually looks in a church: the real Wi-Fi
// on a 192.168 network, plus every virtual switch Hyper-V / VirtualBox / Docker
// / a VPN likes to leave behind. This is the table that used to make a packaged
// build print a class-B 172.x address no phone could reach.
const CHURCH_PC = {
  'Wi-Fi': [
    { family: 'IPv4', internal: false, address: '192.168.1.6' },
    { family: 'IPv6', internal: false, address: 'fe80::1' },
  ],
  'vEthernet (Default Switch)': [{ family: 'IPv4', internal: false, address: '172.20.144.1' }],
  'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.24.80.1' }],
  'VirtualBox Host-Only Network': [{ family: 'IPv4', internal: false, address: '192.168.56.1' }],
  'TAP-Windows Adapter V9': [{ family: 'IPv4', internal: false, address: '10.8.0.2' }],
  'Loopback Pseudo-Interface 1': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
};

test('the real LAN adapter outranks every virtual switch', () => {
  const list = listAddresses(CHURCH_PC);
  assert.equal(list[0].address, '192.168.1.6');
  assert.equal(list[0].name, 'Wi-Fi');
  // Loopback and IPv6 are never candidates.
  assert.equal(list.length, 5);
  assert.ok(!list.some((a) => a.address === '127.0.0.1' || a.address === 'fe80::1'));
  // Every virtual switch sorts behind both real adapters, whatever order the
  // OS happened to report them in.
  assert.deepEqual(list.filter((a) => !a.virtual).map((a) => a.address), ['192.168.1.6', '10.8.0.2']);
  assert.deepEqual(list.slice(2).map((a) => a.address).sort(), ['172.20.144.1', '172.24.80.1', '192.168.56.1']);
  assert.equal(list.find((a) => a.address === '192.168.1.6').virtual, false);
  assert.equal(list.find((a) => a.address === '172.20.144.1').virtual, true);
});

test('an APIPA address loses to a working adapter, and is still usable alone', () => {
  const both = listAddresses({
    Ethernet: [{ family: 'IPv4', internal: false, address: '169.254.10.4' }],
    'Wi-Fi': [{ family: 'IPv4', internal: false, address: '192.168.1.6' }],
  });
  assert.equal(pickAddress({ addresses: both }), '192.168.1.6');

  const onlyApipa = listAddresses({ Ethernet: [{ family: 'IPv4', internal: false, address: '169.254.10.4' }] });
  assert.equal(pickAddress({ addresses: onlyApipa }), '169.254.10.4');
});

test('a wired desktop on 10.x is not punished for not being 192.168', () => {
  const list = listAddresses({
    'Wi-Fi': [{ family: 'IPv4', internal: false, address: '172.20.144.1' }],
    Ethernet: [{ family: 'IPv4', internal: false, address: '10.20.30.40' }],
  });
  assert.equal(pickAddress({ addresses: list }), '10.20.30.40');
});

test('the route probe wins over the ranking, a pin wins over both', () => {
  const addresses = listAddresses(CHURCH_PC);

  // The OS says it leaves through the wired NIC even though Wi-Fi ranks first.
  assert.equal(pickAddress({ addresses, probed: '10.8.0.2' }), '10.8.0.2');

  // The operator overrode it (VPN that the phones must use, hotspot, dual NIC).
  assert.equal(pickAddress({ addresses, probed: '10.8.0.2', pinned: '172.24.80.1' }), '172.24.80.1');
});

test('a pin or probe from another network is ignored, never printed', () => {
  const addresses = listAddresses(CHURCH_PC);
  // Laptop moved from church to home: yesterday's addresses are gone.
  assert.equal(pickAddress({ addresses, probed: '192.168.99.7', pinned: '10.0.0.5' }), '192.168.1.6');
  // Half-stale: the pin vanished but the probe is still valid.
  assert.equal(pickAddress({ addresses, probed: '10.8.0.2', pinned: '10.0.0.5' }), '10.8.0.2');
});

test('no interface at all still yields a usable loopback URL', () => {
  assert.deepEqual(listAddresses({}), []);
  assert.equal(pickAddress({ addresses: [] }), '127.0.0.1');
  assert.equal(pickAddress(), '127.0.0.1');
});

test('private ranges are recognised, public and link-local ones are not', () => {
  for (const a of ['10.0.0.1', '192.168.1.6', '172.16.0.1', '172.31.255.254']) assert.equal(isPrivateV4(a), true, a);
  for (const a of ['8.8.8.8', '172.32.0.1', '169.254.1.1', '127.0.0.1']) assert.equal(isPrivateV4(a), false, a);
  // 172.17-31 is the virtual-switch range, so it scores below a plain 192.168 one.
  assert.ok(scoreAddress('Ethernet', '192.168.1.6') > scoreAddress('Ethernet', '172.17.0.1'));
});
