# Kunstpakket AI Search Widget 🎨

Professional AI-powered search widget for kunstpakket.nl

## ✨ Features
- 🔍 Real-time AI search with intelligent product results
- 🎨 Beautiful modal UI with smooth animations
- 📱 Fully responsive (mobile & desktop)
- 🚀 Lightweight vanilla JS bundle (5.8KB minified)
- 🔐 Feature flag protected (`?f=1` in URL)
- ⚡ Zero dependencies, pure vanilla JS
- 🎯 Debounced search (300ms) for optimal performance

## 🚀 Live Deployment

**Widget URL:** `https://frederique-ai.lotapi.workers.dev/widget.js`  
**Search API:** `https://frederique-ai.lotapi.workers.dev/search`  
**Test Page:** Open `test.html?f=1` in browser

## 📦 Installation on kunstpakket.nl

Add this script tag to your site:
```html
<script src="https://frederique-ai.lotapi.workers.dev/widget.js"></script>
```

**Enable for testing:** Add `?f=1` to URL once per session.

## 🎯 How It Works

1. **Feature Flag Check**: Widget only loads if `?f=1` in URL or session enabled
2. **Click Triggers**: Desktop (`#formSearch`) or Mobile (`#nav .search`)
3. **Search**: User types → debounced API call → AI Search
4. **Results**: Beautiful modal with:
   - AI-generated answer
   - Product cards (image, title, price)
   - Direct links to product pages

## 🛠️ Development

### Setup
```bash
npm install
npm run build
```

### Build & Deploy
```bash
npm run dev     # Watch mode (auto-rebuild on changes)
npm run build   # Production build → dist/widget.js
npm run deploy  # Deploy to Cloudflare Workers
```

### Project Structure
```
widget/
├── src/
│   ├── js/
│   │   ├── index.js    # Entry point + feature flag
│   │   ├── widget.js   # Main widget logic
│   │   ├── search.js   # API calls
│   │   └── ui.js       # DOM manipulation
│   └── styles/
│       └── widget.scss # Widget styles
├── worker/
│   └── index.js        # Cloudflare Worker (API proxy)
├── dist/
│   └── widget.js       # Built bundle (5.8KB)
├── build.js            # esbuild + SCSS compiler
└── test.html           # Local test page
```

## 🔧 Architecture

### Widget (Frontend)
- **Technology**: Vanilla JavaScript ES6+
- **Styling**: SCSS compiled to CSS, inlined in bundle
- **Build Tool**: esbuild (fast, zero-config)
- **Bundle Size**: 5.8KB (minified)

### Worker (Backend)
- **Platform**: Cloudflare Workers
- **Endpoints**:
  - `GET /widget.js` → Serve bundled widget
  - `POST /search` → Proxy to AI Search API
- **Features**: CORS handling, YAML parsing, response transformation

### Search Flow
```
User types "schilderij voor €50"
  ↓ (300ms debounce)
Widget → POST /search → Cloudflare AI Search
  ↓ (AI generates answer + finds products)
Worker parses YAML frontmatter → Returns JSON
  ↓
Widget displays modal with results
```

## 🎨 Customization

### Change API Endpoint
Edit `src/js/search.js`:
```javascript
const API_ENDPOINT = 'https://your-domain.com/search';
```

### Adjust Debounce Time
Edit `src/js/widget.js`:
```javascript
debounceTimer = setTimeout(async () => { ... }, 300); // Change 300ms
```

### Modify Styles
Edit `src/styles/widget.scss` and rebuild.

### Change Product Limit
Edit `worker/index.js`:
```javascript
}).filter(p => p && p.id).slice(0, 8); // Change max products
```

## 🧪 Testing

1. Open `test.html?f=1` in browser
2. Click "Desktop Search" or "Mobile Search"
3. Type queries like:
   - "schilderij"
   - "beeldje voor budget €50"
   - "mok met hartje"

## 🔐 Security

- **Feature Flag**: Only active with `?f=1` (session-based)
- **API Token**: Hardcoded in worker (server-side only)
- **CORS**: Configured for kunstpakket.nl domain
- **Rate Limiting**: Via Cloudflare Workers (automatic)

## 📊 Performance

- **Bundle Size**: 5.8KB (gzipped ~3KB)
- **Load Time**: < 100ms (edge network)
- **Search Latency**: ~1-2s (AI Search API)
- **Debounce**: 300ms (prevents excessive API calls)

## 🐛 Troubleshooting

**Widget not loading?**
- Check `?f=1` in URL
- Open DevTools → Console for errors
- Verify `sessionStorage.getItem('kp_widget_enabled') === '1'`

**Search not working?**
- Check API endpoint in Network tab
- Verify AI Search is synced in Cloudflare Dashboard
- Check worker logs: `npx wrangler tail`

**No products showing?**
- Verify R2 bucket has .md files
- Check YAML frontmatter format in files
- Inspect API response structure

## 📝 Notes

- Widget is **inlined** in worker (no external dependencies)
- YAML parsing is done server-side (safer, faster)
- Session storage persists across page loads
- Modal closes on ESC key or overlay click

## 🚀 Next Steps

1. Test on kunstpakket.nl staging
2. Monitor search queries & performance
3. A/B test with real users
4. Optimize based on feedback

---

**Built with ❤️ using Cloudflare Workers, esbuild, and vanilla JavaScript**
