import test from 'node:test';
import assert from 'node:assert/strict';
import { useSongEditorStore } from '../../src/store/useSongEditorStore.js';
import { usePresentationStore } from '../../src/store/usePresentationStore.js';
import { useServiceStore } from '../../src/store/useServiceStore.js';
import { useUIStore } from '../../src/store/useUIStore.js';

const store = useSongEditorStore;
const song = (text = 'one') => ({
  id: 1,
  title: 'Song',
  cues: [
    { id: 'a', label: 'Verse 1', text, box: { x: 80, y: 100, w: 1120, h: 480 } },
    { id: 'b', label: 'Chorus', text: 'two', box: { x: 80, y: 100, w: 1120, h: 480 } },
  ],
});

const reset = () => store.getState().loadDocument(song());

test('selection is editor-local and never enters the document', () => {
  reset();
  store.getState().selectObject(1, 'b');
  assert.equal(store.getState().activeObjectIndex, 1);
  assert.deepEqual(store.getState().selectedElementIds, ['b']);
  assert.equal(store.getState().document.selectedElementIds, undefined);
  store.getState().setEditorCueIdx(-1);
  assert.equal(store.getState().editorCueIdx, -1, 'title slide index stays valid');
  assert.deepEqual(store.getState().selectedElementIds, []);
});

test('add, update, duplicate, reorder and delete preserve stable ids', () => {
  reset();
  store.getState().addCue({ id: 'c', label: 'Bridge', text: 'three' });
  assert.equal(store.getState().document.cues.length, 3);
  store.getState().updateCueAt(2, { text: 'three!' });
  assert.equal(store.getState().document.cues[2].text, 'three!');
  store.getState().duplicateCueAt(0);
  assert.equal(store.getState().document.cues.length, 4);
  assert.equal(store.getState().document.cues[1].id, undefined, 'copy gets a new database id');
  assert.equal(store.getState().document.cues[1].text, 'one');
  store.getState().reorderCue(0, 3);
  assert.equal(store.getState().document.cues[3].id, 'a');
  store.getState().deleteCueAt(0);
  assert.equal(store.getState().document.cues.length, 3);
});

test('undo and redo restore full documents', () => {
  reset();
  store.getState().updateCueAt(0, { text: 'changed' });
  assert.equal(store.getState().history.length, 1);
  assert.equal(store.getState().document.cues[0].text, 'changed');
  const undone = store.getState().undo();
  assert.equal(undone.cues[0].text, 'one');
  assert.equal(store.getState().future.length, 1);
  const redone = store.getState().redo();
  assert.equal(redone.cues[0].text, 'changed');
  assert.equal(store.getState().future.length, 0);
});

test('one drag/resize gesture produces exactly one history entry', () => {
  reset();
  store.getState().beginGesture();
  for (let i = 0; i < 60; i++) {
    store.getState().updateCueAt(0, { box: { x: 80 + i, y: 100 + i, w: 1120, h: 480 } });
  }
  assert.equal(store.getState().history.length, 0, 'no entry while the pointer is down');
  store.getState().endGesture();
  assert.equal(store.getState().history.length, 1);
  store.getState().undo();
  assert.deepEqual(store.getState().document.cues[0].box, { x: 80, y: 100, w: 1120, h: 480 });
});

test('a gesture with no actual change adds no undo entry', () => {
  reset();
  store.getState().beginGesture();
  store.getState().endGesture();
  assert.equal(store.getState().history.length, 0);
});

test('typing bursts collapse; breakHistory starts a new step', () => {
  reset();
  store.getState().updateCueAt(0, { text: 'a' });
  store.getState().updateCueAt(0, { text: 'ab' });
  store.getState().updateCueAt(0, { text: 'abc' });
  assert.equal(store.getState().history.length, 1);
  store.getState().breakHistory();
  store.getState().updateCueAt(0, { text: 'bulk' });
  assert.equal(store.getState().history.length, 2);
  store.getState().undo();
  assert.equal(store.getState().document.cues[0].text, 'abc');
});

test('dirty state follows the baseline and save status', () => {
  reset();
  assert.equal(store.getState().isDirty, false);
  store.getState().updateCueAt(0, { text: 'dirty' });
  assert.equal(store.getState().isDirty, true);
  assert.equal(store.getState().saveStatus, 'unsaved');
  store.getState().markSaving();
  assert.equal(store.getState().saveStatus, 'saving');
  store.getState().markSaved();
  assert.equal(store.getState().isDirty, false);
  assert.equal(store.getState().saveStatus, 'saved');
  store.getState().undo();
  assert.equal(store.getState().isDirty, true, 'undoing past the saved baseline is dirty again');
});

test('editor changes never touch presentation or service state', () => {
  reset();
  const deck = { id: 'deck', title: 'Sermon', slides: [{ id: 's1' }, { id: 's2' }] };
  usePresentationStore.getState().setActivePresentation({ deck, index: 1 });
  const uiBefore = { left: useUIStore.getState().leftOpen, settings: useUIStore.getState().showSettings };
  const snapshot = usePresentationStore.getState().activePresentation;

  for (let i = 0; i < 10; i++) store.getState().updateCueAt(0, { text: `edit-${i}` });
  store.getState().selectObject(0, 'a');
  store.getState().beginGesture();
  store.getState().updateCueAt(0, { box: { x: 1, y: 2, w: 300, h: 200 } });
  store.getState().endGesture();

  assert.equal(usePresentationStore.getState().activePresentation, snapshot);
  assert.equal(usePresentationStore.getState().playback.index, 1);
  assert.deepEqual({ left: useUIStore.getState().leftOpen, settings: useUIStore.getState().showSettings }, uiBefore);
});

test('presentation playback updates without changing the editor document', () => {
  reset();
  const before = store.getState().document;
  const deck = { id: 'd', slides: [{}, {}] };
  usePresentationStore.getState().setActivePresentation({ deck, index: 0 });
  assert.equal(usePresentationStore.getState().playback.status, 'live');
  usePresentationStore.getState().setSlideIndex(1);
  assert.equal(usePresentationStore.getState().playback.index, 1);
  usePresentationStore.getState().stopPresentation();
  assert.equal(usePresentationStore.getState().playback.status, 'idle');
  assert.equal(store.getState().document, before);
});

test('UI store boolean setters accept values and functional toggles', () => {
  useUIStore.getState().setLeftOpen(false);
  assert.equal(useUIStore.getState().leftOpen, false);
  useUIStore.getState().setLeftOpen((v) => !v);
  assert.equal(useUIStore.getState().leftOpen, true);
  useUIStore.getState().setShowSettings(true);
  assert.equal(useUIStore.getState().showSettings, true);
  useUIStore.getState().setShowSettings(false);
});

test('service store accepts functional updates and reset', () => {  useServiceStore.getState().setServices([{ id: 's1' }]);
  useServiceStore.getState().setActiveService((prev) => ({ ...prev, name: 'Sunday AM' }));
  useServiceStore.getState().setSelectedServiceId('s1');
  assert.equal(useServiceStore.getState().services.length, 1);
  assert.equal(useServiceStore.getState().activeService.name, 'Sunday AM');
  assert.equal(useServiceStore.getState().selectedServiceId, 's1');
  useServiceStore.getState().resetActiveService();
  assert.equal(useServiceStore.getState().selectedServiceId, '');
  assert.deepEqual(useServiceStore.getState().activeService.items, []);
});

test('saved document reload starts a clean history and baseline', () => {
  reset();
  const saved = { ...song('saved'), id: 9, cues: [] };
  store.getState().loadDocument(saved, { baseline: saved, editorCueIdx: -1 });
  assert.equal(store.getState().editorCueIdx, -1);
  assert.equal(store.getState().history.length, 0);
  assert.equal(store.getState().isDirty, false);
  assert.equal(store.getState().saveStatus, 'saved');
});

test('a completed save adopts the normalised snapshot without reading as dirty', () => {
  reset();
  store.getState().updateCueAt(0, { text: 'save me' });
  const normalised = {
    ...store.getState().document,
    cues: store.getState().document.cues.map((c) => ({
      ...c,
      box: { ...c.box, angle: 0 },
      geometryVersion: 1,
    })),
  };
  store.getState().markSaving();
  store.getState().markSaved(normalised);
  assert.equal(store.getState().document, normalised);
  assert.equal(store.getState().baseline, normalised);
  assert.equal(store.getState().isDirty, false);
  assert.equal(store.getState().saveStatus, 'saved');
  assert.equal(store.getState().savingDocument, null);
});

test('edits made while the save is in flight stay dirty against the saved copy', () => {
  reset();
  store.getState().updateCueAt(0, { text: 'first' });
  store.getState().markSaving();
  store.getState().updateCueAt(0, { text: 'typed during save' });
  const saved = { ...store.getState().document, cues: [{ ...store.getState().document.cues[0], text: 'first' }] };
  store.getState().markSaved(saved);
  assert.equal(store.getState().document.cues[0].text, 'typed during save');
  assert.equal(store.getState().baseline, saved);
  assert.equal(store.getState().isDirty, true);
  assert.equal(store.getState().saveStatus, 'unsaved');
});
