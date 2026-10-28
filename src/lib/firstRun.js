// First-run detection for the operator window.
//
// A brand-new install must open CLEAN: no song loaded, no tempo carried over
// from the stage config, and no recovered service draft from an older session.
// The marker makes that a one-time event, and any pre-existing setting also
// counts as "not first run", so upgrading an install that already has data
// never wipes it — only a genuinely empty profile (the first launch ever)
// takes the blank path.
//
// Pure module: takes a storage object (localStorage in the app) so the policy
// can be tested without a DOM.

export const FIRST_RUN_MARKER = 'kog_first_run_done';

// Single-slot crash recovery for the Song Editor / service plan — the two
// things an operator builds live on a Sunday. They exist only while there are
// unsaved changes, so finding one means this profile has already been used.
export const SONG_DRAFT_KEY = 'kog-song-draft';
export const SERVICE_DRAFT_KEY = 'kog-service-draft';

// Any of these existing means this profile has been used before.
export const BOOT_STATE_KEYS = [
  'kog_stage_cfg', 'kog-theme', 'kog_grid_density', 'kog_output_aspect',
  'kog_countdown', 'kog_countdown_templates', SERVICE_DRAFT_KEY, SONG_DRAFT_KEY,
];

export const detectFirstRunBoot = (storage) => {
  if (!storage) return false;
  try {
    if (storage.getItem(FIRST_RUN_MARKER) === '1') return false;
    const hadState = BOOT_STATE_KEYS.some((key) => storage.getItem(key) != null);
    // Mark before deciding: the blank boot must not repeat on every launch.
    storage.setItem(FIRST_RUN_MARKER, '1');
    return !hadState;
  } catch {
    return false;
  }
};
