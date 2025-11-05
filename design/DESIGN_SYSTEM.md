# Command Center Design System

## Design Philosophy

The Command Center design system is inspired by **Baseten** - clean, professional, and firm.

### Core Principles
1. **No rounded corners** - All border-radius values are 0
2. **No gradients** - Only solid colors
3. **Minimalist** - Clean and professional aesthetic
4. **High contrast** - Strong black and white with bright green accents
5. **Sharp and precise** - Geometric, brutalist approach
6. **Compact and tight** - Reduced padding, tight line-heights (1.4), small gaps (4px-8px), creating a dense, information-rich layout

---

## Color Palette

### Primary Colors
```css
--primary: #00D9A0;        /* Bright green accent */
--primary-dark: #00B885;   /* Darker green for hover states */
--black: #000000;          /* Primary buttons, headings */
--dark-gray: #1A1A1A;      /* Hover states */
```

### Neutrals
```css
--gray-900: #000000;
--gray-800: #1A1A1A;
--gray-700: #333333;
--gray-600: #4D4D4D;
--gray-500: #6B7280;
--gray-400: #9CA3AF;
--gray-300: #D1D5DB;
--gray-200: #E5E7EB;
--gray-100: #F3F4F6;
--gray-50: #F9FAFB;
--white: #FFFFFF;
```

### Semantic Colors
```css
--success: #00D9A0;       /* Same as primary green */
--warning: #F59E0B;       /* Amber */
--error: #EF4444;         /* Red */
--info: #00D9A0;          /* Same as primary green */
```

### Usage Guidelines
- **Primary green (#00D9A0)**: Use for active states, focus rings, success messages, and accent elements
- **Black (#000000)**: Use for primary buttons, important headings
- **White (#FFFFFF)**: Use for background, card backgrounds, button text on dark backgrounds
- **Grays**: Use for text hierarchy, borders, and subtle UI elements

**DO NOT USE:**
- Gradients of any kind
- Purple, blue, or other accent colors
- Any border-radius > 0

---

## Typography

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Type Scale
```css
/* Display Sizes */
Display XL: 48px / 700 weight / -0.02em letter-spacing
Display L:  36px / 700 weight / -0.015em letter-spacing

/* Headings */
H1: 28px / 600 weight / -0.01em letter-spacing
H2: 20px / 600 weight / -0.01em letter-spacing
H3: 16px / 600 weight / 0 letter-spacing

/* Body Text - Compact line heights for tighter spacing */
Body Large:   15px / 400 weight / 1.5 line-height
Body Regular: 14px / 400 weight / 1.4 line-height (compact)
Body Small:   13px / 400 weight / 1.4 line-height (compact)

/* Utility */
Caption: 12px / 500 weight / 1.4 line-height (compact)
Label:   11px / 700 weight / 0.06em letter-spacing / uppercase
```

### Color Usage
- Primary headings: `--gray-900` (black)
- Body text: `--gray-700` or `--gray-600`
- Secondary text: `--gray-500`
- Disabled text: `--gray-400`

---

## Spacing System

Use multiples of 4px for all spacing (compact and tight):

```css
4px   → Tight spacing (gaps in badges, small margins)
6px   → Very compact spacing (form groups)
8px   → Small spacing (between elements, button gaps)
12px  → Default gap (card padding, section spacing)
16px  → Medium spacing (group padding)
24px  → Large spacing (section padding, container padding)
32px  → XL spacing (header padding)
64px  → XXL spacing (between major sections)
```

---

## Components

### Buttons

#### Primary Button
- **Background**: Black (#000000)
- **Text**: White
- **Border**: None
- **Border-radius**: 0
- **Padding**: 6px 12px (very compact and tight)
- **Font**: 13px / 600 weight
- **Hover**: Background changes to #1A1A1A
- **Active**: Background changes to #333333

```html
<button class="btn-primary">Get Started</button>
```

#### Secondary Button
- **Background**: White
- **Text**: Gray-700
- **Border**: 1px solid gray-300
- **Border-radius**: 0
- **Padding**: 6px 12px (very compact and tight)
- **Hover**: Background gray-50, border gray-400

```html
<button class="btn-secondary">Learn More</button>
```

#### Ghost Button
- **Background**: Transparent
- **Text**: Gray-600
- **Border**: None
- **Padding**: 6px 10px (very compact and tight)
- **Font**: 13px / 500 weight
- **Hover**: Background gray-100

```html
<button class="btn-ghost">Cancel</button>
```

#### Danger Button
- **Background**: #EF4444 (red)
- **Text**: White
- **Border**: None
- **Padding**: 6px 12px (very compact and tight)
- **Font**: 13px / 600 weight
- **Hover**: Background #DC2626

#### Button Size Variants
- **Small**: Padding 4px 10px, Font-size 12px (extra compact)
- **Regular**: Padding 6px 12px, Font-size 13px (standard compact)
- **Large**: Padding 10px 18px, Font-size 14px (larger but still compact)

---

### Cards

#### Standard Card
- **Background**: White
- **Border**: 1px solid gray-200
- **Border-radius**: 0
- **Padding**: 12px (compact)
- **Shadow**: `0 1px 3px rgba(0,0,0,0.08)`
- **Hover**: Lift with `translateY(-2px)` and stronger shadow

```html
<div class="card">
  <h3>Card Title</h3>
  <p>Card content goes here</p>
</div>
```

#### Emphasized Card
- **Border**: 1.5px solid gray-300
- **Padding**: 16px (more compact)
- **Shadow**: Stronger than standard

#### Status Cards
Success/Warning/Error cards have:
- **Border-left**: 3px solid (semantic color)
- **Background**: Light tint of semantic color
- **Padding**: 10px 12px (compact)

---

### Forms

#### Text Input / Textarea / Select
- **Background**: White
- **Border**: 1px solid gray-300
- **Border-radius**: 0
- **Padding**: 6px 10px (compact)
- **Font-size**: 13px
- **Hover**: Border becomes gray-400
- **Focus**: Border becomes primary green (#00D9A0) with `box-shadow: 0 0 0 3px rgba(0,217,160,0.1)`

```html
<div class="form-group">
  <label class="form-label">Email</label>
  <input type="email" class="form-input" placeholder="Enter email">
  <span class="form-hint">We'll never share your email</span>
</div>
```

#### Toggle Switch
- **Unchecked**: Gray-300 background
- **Checked**: Primary green background (#00D9A0)
- **Slider**: White circle, 0 border-radius
- **Width**: 48px
- **Height**: 26px

#### Checkbox
- **Size**: 18x18px
- **Accent-color**: Primary green

---

### Badges

```css
/* Badge Base */
padding: 4px 8px          /* Compact and tight */
border-radius: 0
font-size: 10px           /* Small and compact */
font-weight: 700
text-transform: uppercase
letter-spacing: 0.05em
border: 1px solid
```

#### Badge Variants
- **Success/Primary/Info**: Light green bg (#E6F9F4), green border (#00D9A0), dark green text (#00755A)
- **Warning**: Light amber bg, amber border
- **Error**: Light red bg, red border
- **Neutral**: Gray-100 bg, gray-300 border, gray-700 text

```html
<span class="badge badge-success">Active</span>
<span class="badge badge-warning">Pending</span>
<span class="badge badge-error">Failed</span>
```

---

## Shadows

Use subtle shadows only:

```css
--shadow-xs: 0 1px 2px rgba(0,0,0,0.05)
--shadow-sm: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)
--shadow-md: 0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)
--shadow-xl: 0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04)
```

Use sparingly - prefer clean borders over heavy shadows.

---

## Animations

### Timing Functions
```css
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)
--ease-smooth: cubic-bezier(0.23, 1, 0.32, 1)
--timing-base: 200ms
```

### Common Transitions
- **Hover lift**: `transform: translateY(-2px)`
- **Button press**: `transform: translateY(0)`
- **Scale**: Only use for interactive feedback, keep subtle (1.02 max)

---

## Layout

### Container Widths
```css
max-width: 1280px  /* Main content container */
padding: 0 48px    /* Container horizontal padding */
```

### Grid Systems
Use CSS Grid for card layouts:
```css
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
gap: 24px;
```

---

## Navigation

### Sticky Nav
- **Background**: White with 0.9 opacity
- **Backdrop-filter**: blur(20px)
- **Border-bottom**: 1px solid gray-200
- **Shadow**: Subtle shadow-sm

### Nav Links
- **Padding**: 16px 20px
- **Color**: Gray-600
- **Hover**: Gray-900 text, gray-50 background
- **Active indicator**: 2px green underline that scales in on hover

---

## Best Practices

### DO
✓ Use sharp, 0-radius corners on everything
✓ Use solid black for primary actions
✓ Use bright green (#00D9A0) for accents and success states
✓ Maintain strong contrast between text and backgrounds
✓ Use clean white backgrounds
✓ Keep animations subtle and fast (200ms)
✓ Use system fonts (Inter preferred)

### DON'T
✗ Use any border-radius > 0
✗ Use gradients
✗ Use purple, blue, or other non-brand colors for accents
✗ Use heavy shadows
✗ Use decorative elements
✗ Use complex animations
✗ Mix different design styles

---

## Code Examples

### Complete Form Example
```html
<form class="form-container">
  <div class="form-group">
    <label class="form-label">Project Name</label>
    <input
      type="text"
      class="form-input"
      placeholder="Enter project name"
    >
  </div>

  <div class="form-group">
    <label class="form-label">Description</label>
    <textarea
      class="form-textarea"
      placeholder="Describe your project"
    ></textarea>
  </div>

  <div class="toggle-group">
    <label class="toggle-switch">
      <input type="checkbox">
      <span class="toggle-slider"></span>
    </label>
    <span class="toggle-label">Enable notifications</span>
  </div>

  <div class="button-group">
    <button type="submit" class="btn-primary">Create Project</button>
    <button type="button" class="btn-ghost">Cancel</button>
  </div>
</form>
```

### Card Grid Example
```html
<div class="card-grid">
  <div class="card">
    <h3 class="card-title">Feature Name</h3>
    <p class="card-description">Description of the feature goes here.</p>
    <span class="badge badge-success">Active</span>
  </div>

  <div class="card">
    <h3 class="card-title">Another Feature</h3>
    <p class="card-description">More content here.</p>
    <span class="badge badge-warning">Beta</span>
  </div>
</div>
```

---

## Accessibility

- Maintain WCAG AA contrast ratios (4.5:1 for body text, 3:1 for large text)
- All interactive elements must have visible focus states
- Use semantic HTML
- Include proper ARIA labels for custom components
- Ensure keyboard navigation works for all interactive elements

---

## Reference

This design system is inspired by:
- **Baseten** (https://baseten.co) - Clean, professional, minimal design with bright green accents
- **Brutalist design principles** - Sharp edges, high contrast, no-nonsense aesthetics

For questions or updates, refer to `/command-center/design/showcase.css` for implementation details.
