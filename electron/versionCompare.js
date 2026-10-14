// Version comparison for the auto-updater — dependency-free on purpose.
// electron-updater's checkForUpdates() RESOLVES with the remote latest's
// updateInfo even when it is identical to (or older than) the running build;
// only its *events* compare versions. The manual Check path used to treat
// "any returned updateInfo" as "available", so an up-to-date app always
// reported an update and Download then answered "up to date" — the loop
// users saw. Both sides now gate on semverGt(remote, current).

// Split "1.2.3", "1.2", "v1.2.3-beta.1+build" into numeric parts + prerelease.
export function parseVersion(v) {
  const m = String(v || '').trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9a-zA-Z.-]+))?(?:\+[0-9a-zA-Z.-]+)?$/);
  if (!m) return null;
  return {
    nums: [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)],
    pre: m[4] || null,
  };
}

// True only when a > b. Equal, unparseable, or older => false (never offer
// a reinstall/downgrade as an "update"). A release beats its own
// prerelease (1.2.3 > 1.2.3-beta); between prereleases, lexical compare.
export function semverGt(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] > pb.nums[i];
  }
  if (pa.pre === pb.pre) return false;
  if (pa.pre == null) return true;
  if (pb.pre == null) return false;
  return pa.pre > pb.pre;
}
