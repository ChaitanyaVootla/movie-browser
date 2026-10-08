import type React from "react";

/**
 * Card actions render INSIDE the card's `<Link>`, and the quick-log Dialog /
 * Drawer and the save-to-list Popover are React portals. React bubbles portal
 * events through the React tree, not the DOM — so a click anywhere in the
 * dialog (the note field, a star, the scrim) reached `<Link>`'s onClick and
 * navigated to the title page mid-form. Stop only events that did NOT originate
 * in this wrapper's DOM (i.e. came through a portal); clicks on the wrapper
 * itself keep their existing behaviour.
 */
export function stopPortalClicks(e: React.MouseEvent<HTMLElement>) {
  if (!e.currentTarget.contains(e.target as Node)) e.stopPropagation();
}
