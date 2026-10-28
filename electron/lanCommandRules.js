// Who may run a LAN command — ONE policy every socket message goes through.
//
// A socket is read-only until it proves otherwise:
//   * `control` — paired with the operator's PIN; may run anything.
//   * `stage`   — no PIN (singers only receive), with one deliberate
//                 exception: the drummer surface is provisioned as `stage`
//                 but owns the click, so `metronomeSet` (tempo / meter /
//                 song pick) must reach the console. Every other command
//                 stays control-only.
//
// Pure module: safe to unit test without starting the WebSocket server.

export const STAGE_COMMANDS = new Set(['metronomeSet']);

export const canRunLanCommand = ({ role, authed, control, cmd } = {}) => {
  if (role === 'control' && control) return true;
  return role === 'stage' && authed === true && STAGE_COMMANDS.has(cmd);
};
