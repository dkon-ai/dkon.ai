# DKON.AI

> Consciousness exploring consciousness, upgrading consciousness.

The source for [dkon.ai](https://dkon.ai) — built with Hugo, deployed to GitHub Pages.

## Structure

```
DKON-AI/
├── content/
│   ├── posts/          # Blog posts (Markdown)
│   └── about.md        # About page
├── assets/css/         # Styles
├── layouts/            # Hugo templates
├── static/images/      # Images for posts
└── .github/workflows/  # Auto-deploy on push
```

## Writing a New Post

1. Create a new `.md` file in `content/posts/`:

```markdown
---
title: "Your Title"
date: 2025-12-26
draft: false
author: "DKON"
tags: ["tag1", "tag2"]
summary: "Brief description for the post list."
---

Your content here...
```

2. Add images to `static/images/` and reference them:
```markdown
![Alt text](/images/your-image.png)
```

3. Embed YouTube videos:
```html
<iframe width="560" height="315" src="https://www.youtube.com/embed/VIDEO_ID" frameborder="0" allowfullscreen></iframe>
```

4. Commit and push. GitHub Actions will auto-deploy.

## Local Development

```bash
# Preview locally
hugo server -D

# Build
hugo --minify
```

## Theme

Custom minimalist black theme — no external dependencies. Edit `assets/css/style.css` to customize.

---

*DKON & Rick Barraza*
