# Senate bloc emblems

## Build
- Add a separate emblem field to senate blocs so portraits and icons remain independent.
- Convert the nine supplied emblems to app-safe image assets and assign them to matching blocs in existing Republic Senate sets.
- Show each emblem prominently on the nine senate bloc cards at the top of Politics.
- Redesign each vote rectangle with the current choice label above the emblem; remove the bloc name from inside the rectangle. The default label remains “Do Not Influence.”
- Add emblem preview and selection controls to each bloc in Assets > Politics, reusing the same image source and saved field.
- Preserve bloc names for accessibility and tooltips even where the visible name is removed.

## Verification
- Confirm all nine emblems render in the top row, vote rectangles cycle correctly, and the editor can change an emblem.
- Check the game at desktop and narrow widths, then confirm the latest build is clean.

## Technical details
- Store the emblem URL in `senate_blocs.icon_url`; include it in set export, import, duplication, and shared bloc loading.
- Keep `image_url` for the existing playing-card artwork.
