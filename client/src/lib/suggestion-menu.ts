export const SUGGESTION_MENU_GAP = 6;
export const SUGGESTION_MENU_MIN = 168;
export const SUGGESTION_MENU_MAX = 288;

export type SuggestionMenuInput = {
  inputTop: number;
  inputBottom: number;
  viewportTop: number;
  viewportBottom: number;
  /** Bottom edge of the nearest ancestor that clips overflow. */
  clipBottom: number;
  safeBottom: number;
  appliedLift: number;
  /** Pixels kept clear at the top for the navbar and map controls. */
  chromeTop: number;
};

/**
 * Place the suggestion list under the field and inside the visible screen.
 * A short iPhone viewport lifts the dock; a tall Chrome viewport does not.
 */
export function suggestionMenuFrame(input: SuggestionMenuInput) {
  const visibleBottom = Math.min(input.viewportBottom, input.clipBottom) - Math.max(0, input.safeBottom);
  let room = visibleBottom - input.inputBottom - SUGGESTION_MENU_GAP - 8;
  let lift = Math.max(0, input.appliedLift);

  if (room < SUGGESTION_MENU_MIN) {
    const maxExtra = Math.max(0, input.inputTop - (input.viewportTop + input.chromeTop));
    const extra = Math.min(maxExtra, SUGGESTION_MENU_MIN - room);
    lift += extra;
    room += extra;
  } else if (lift > 0) {
    const reduce = Math.min(lift, room - SUGGESTION_MENU_MIN);
    lift -= reduce;
    room -= reduce;
  }

  return {
    lift: Math.round(Math.max(0, lift)),
    maxHeight: Math.round(Math.min(SUGGESTION_MENU_MAX, Math.max(72, room))),
  };
}
