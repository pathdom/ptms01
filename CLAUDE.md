# CLAUDE.md — Study Abroad Agency Website (`paoth`)

This project is a premium, minimalist, and highly modern study abroad consultancy website. The design language is inspired by high-end boutique editorial layouts (similar to the Palais design style): ultra-clean grids, elegant typography, generous whitespace, thin dividers, warm organic color palettes, and subtle, smooth micro-interactions.

---

## 🛠 Development & Command Reference

Since this is a lightweight, high-performance static website built with pure HTML, Vanilla CSS, and modern JavaScript, we don't need heavy frameworks. We use modern web APIs and utility commands for running a local hot-reloading development server.

### Start Local Development Server
Use `npx` to spin up a lightweight live-reloading dev server without globally installing dependencies:
```bash
# Start a live-reload server pointing to the current directory
npx browser-sync start --server --files "*.html, css/**/*.css, js/**/*.js" --no-notify --port 3000
```
*(Alternatively, you can open `index.html` directly in the browser, or use the "Live Server" extension in VS Code).*

### Project Formatting & Quality Checks
To ensure clean code alignment, we use Prettier:
```bash
# Format all HTML, CSS, and JS files
npx prettier --write "**/*.{html,css,js}"
```

---

## 🎨 Design System & Aesthetics (Palais-Inspired)

The website must look **extremely premium, sophisticated, and trustworthy**. Avoid typical generic, cluttered layouts with bright primary blues/oranges. Instead, follow these bespoke rules:

### 1. Color Palette (Neutral, Warm, Editorial)
- **Background (`--color-bg`)**: Warm Alabaster / Soft Cream (`#FAF8F5` or `#F7F4EF`)
- **Text Primary (`--color-text-main`)**: Deep Charcoal / Carbon (`#1A1A1A` or `#222222`)
- **Text Secondary (`--color-text-muted`)**: Soft Slate / Muted Earth (`#6B6A67` or `#7A7875`)
- **Accent Color (`--color-accent`)**: Warm Antique Gold / Ochre (`#A88B58` or `#BC9E6C`)
- **Dividers/Borders (`--color-border`)**: Elegant thin grey (`rgba(0, 0, 0, 0.08)` or `#E8E5DF`)

### 2. Typography
Use Google Fonts to load a high-contrast editorial pair:
- **Headings (Serif)**: `Cormorant Garamond` or `Playfair Display` (font-weights: 300, 400, 500)
- **Body & UI (Sans-Serif)**: `Plus Jakarta Sans` or `Inter` (font-weights: 300, 400, 500, 600)
- *Aesthetic rule*: Keep titles thin (`font-weight: 300` or `400`) and use letter-spacing to enhance elegance.

### 3. Layout Principles
- **Minimal Grid Lines**: Use `1px` solid, extremely light borders (`rgba(0,0,0,0.06)`) to separate sections structurally, creating an architectural feel.
- **Generous Whitespace**: Section padding should be spacious (`padding: 8rem 0;` or `12rem 0;` on desktop).
- **Asymmetric Elements**: Place headlines, image galleries, and lists in offset grid columns to create dynamic, editorial energy.

### 4. Interactive Micro-Animations
- **Page Transitions**: Smooth fade-in scroll animations using modern CSS `IntersectionObserver` or CSS `@keyframes` with `view-timeline`.
- **Button Hover States**: Text links should have an elegant underline slide-in/out effect (`transform: scaleX()`). Main buttons should use custom glassmorphic hover scales rather than jarring color flashes.
- **Image Reveal**: Hovering over images should result in a subtle zoom scale (`transform: scale(1.05)`) inside an `overflow: hidden` container.

---

## 📁 Directory Structure

```text
paoth/
├── index.html                  # Main entrance (Login Page & Admin Portal)
├── services.html               # Custom study abroad programs & services
├── destinations.html           # Country guides (US, UK, Australia, Canada, Europe)
├── about.html                  # Who we are (Mission, Team, Credentials)
├── contact.html                # Booking & Consulting request
│
├── css/
│   ├── main.css                # Base styling & Design Tokens (CSS variables)
│   └── components/
│       ├── navigation.css      # Floating glass header & footer styles
│       ├── cards.css           # Grid cards & image layout hover styles
│       └── contact-form.css    # Premium minimalist forms
│
├── js/
│   ├── main.js                 # Global micro-interactions, mobile navigation
│   └── scroll-animation.js     # IntersectionObserver for fade-in animations
│
├── assets/
│   ├── images/                 # Optimized visual photography
│   └── icons/                  # Thin SVG icons (Stroke-width: 1px or 1.5px)
│
├── godly.website_website_pa-lais-104.png  # Design inspiration file
└── CLAUDE.md                   # Project guideline and commands
```

---

## 💡 Code & Implementation Guidelines

To maintain an clean, fast, and pristine codebase, follow these rules:

### HTML Guidelines
- Always write semantic, valid HTML5 (`<header>`, `<main>`, `<section>`, `<article>`, `<footer>`).
- Ensure every page contains exactly one `<h1>` tag for search engine optimization (SEO).
- Form fields must have corresponding `<label>` elements and unique `id`s.
- Use native lazy loading for images: `<img src="..." loading="lazy" alt="...">`.

### CSS Guidelines
- **Always** define typography, colors, padding sizes, and transitions in global variables inside `:root` (in `css/main.css`).
- Use **Flexbox** for alignment and **CSS Grid** for main structural templates.
- Strictly avoid absolute positioning for general layout; keep everything fluid and responsive.
- Do NOT use Tailwind CSS or any bulky CSS framework. Write clean, modular Vanilla CSS.
- Ensure all focusable elements have customized, accessible, elegant `:focus-visible` styles.

### JavaScript Guidelines
- Write modular, clean ES6+ Vanilla JS (`const`, `let`, arrow functions, array methods).
- Keep the DOM queries cached: query elements once at the top of your modules.
- Ensure all event handlers are clean and, where appropriate, debounced or throttled (e.g., scroll/resize events).
- Do not import heavy, unneeded libraries (like jQuery). Standard modern Vanilla JS is fully capable of all animation requirements.

---

## 📈 SEO & Performance Checklist

- **Accessibility**: Ensure high contrast for text colors (`#1A1A1A` on `#FAF8F5` yields an exceptional contrast ratio of over 10:1, exceeding WCAG AAA standard).
- **Page Titles**: Dynamic, descriptive title tags, e.g., `Aura Study Abroad | Premium Consultations & Ivy League Admissions`.
- **Meta Descriptions**: Compelling descriptions containing target keywords on every page.
- **Images**: Use modern formats (WebP/SVG) with correct width and height dimensions specified to avoid Layout Shifts (CLS).
- **Fast Load**: Keep script execution minimal and load script tags with the `defer` attribute.
