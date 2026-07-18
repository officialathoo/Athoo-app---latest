# RC2 Runtime Phase B-03

## Changes

- Added a dedicated professional Appearance screen reachable from customer and provider Profile menus.
- Removed the inline segmented theme control from both profile pages.
- Persisted System/Light/Dark selection and synchronized the legacy Colors palette; the app reloads once after a theme change so legacy StyleSheet-based screens rebuild with the selected palette.
- Mobile presigned uploads now honor every required header returned by the API, including the exact signed Content-Type.
- Removed a duplicate private-image purpose-token request that could race and cause unnecessary image failures.
- Added select-all and bulk approve/reject controls to pending service-add requests and pending Premium subscription requests.
- Existing bulk activate/deactivate controls for Categories and Service Areas remain intact.

## Scope note

The theme compatibility bridge covers legacy screens without rewriting their business logic. Individual legacy screens can still be migrated to native useTheme styling incrementally, but they now rebuild from the selected palette after the preference is changed.
