# Analytics Dashboard CSS Fix Needed

## Issue
De eerste kolom header in "Recente Zoekopdrachten" tabel wordt afgesneden.

### Huidige staat:
- Alleen "ju" is zichtbaar (waarschijnlijk "Datum" of "Tijd")
- De header row is te hoog of heeft verkeerde padding
- Column headers: `ju | Zoekopdracht | Resultaten | Clicks | Aankopen`

### Verwacht:
- Volledige header tekst zichtbaar
- Correcte spacing en alignment

### Locatie:
Dashboard URL: https://analytics.bluestars.app
Sectie: "Recente Zoekopdrachten" tabel

### Mogelijke fix:
```css
/* In analytics dashboard stylesheet */
.table-header {
  overflow: visible;
  padding: 12px 16px;
  min-height: auto;
}

.table-header-cell:first-child {
  padding-left: 16px;
  overflow: visible;
}
```

### Te controleren:
1. Header row `height` of `max-height` properties
2. `overflow: hidden` op table of header
3. `padding-top` op eerste kolom
4. Responsive breakpoints voor mobile

## Status
🔴 **Open** - Needs fix in analytics dashboard codebase (separate repository)

## Related
- Analytics tracking werkt correct ✅
- Result counts worden nu correct gemeten ✅
- Deze fix moet in de **analytics dashboard** codebase, niet in deze widget codebase

