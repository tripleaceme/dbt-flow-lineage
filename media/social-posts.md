# Social Media Posts for dbt Flow Lineage

---

## 1. LinkedIn Post

**Title suggestion:** Share as a regular post (not an article)

---

I built a free VS Code extension that shows you exactly where every column in your dbt project comes from — and where it goes.

It's called **dbt Flow Lineage**, and it does something dbt docs can't: column-level lineage with animated data flow.

Here's what it does:

- Click any column and see its full journey traced across models — from source to final table
- Every edge is color-coded: blue (passthrough), green (rename), yellow (transform), purple (aggregate)
- Animated particles flow along the paths so you can literally watch your data move
- Right-click any .sql file to see only that model's lineage — filter by upstream or downstream
- Drag models to rearrange the layout, export as PNG for documentation
- Works on VS Code, Cursor, Windsurf — any VS Code-based editor

The only requirement? Define your columns in schema.yml and run `dbt compile`. That's it. No special SQL patterns needed — SELECT *, CTEs, Jinja all work automatically.

I built this because every column-level lineage tool I found was either:
- Enterprise-only (dbt Cloud, Elementary Cloud, Datafold)
- Needed a separate web server
- Couldn't handle real dbt SQL with CTEs and SELECT *

This one runs entirely inside your editor. No server, no API key, no paid tier.

Install it: Search "dbt Flow Lineage" in the VS Code Extensions tab
GitHub: https://github.com/tripleaceme/dbt-flow-lineage

It's open source (MIT). Contributions and feedback welcome.

#dbt #dataengineering #analytics #vscode #opensource #datalineage

---

## 2. Reddit Post (r/dataengineering)

**Subreddit:** r/dataengineering
**Title:** I built a free VS Code extension for animated column-level lineage in dbt projects

---

**Body:**

I got frustrated that dbt's built-in docs only show model-level lineage — you can see that `dim_artists` depends on `stg_artists`, but not which specific columns flow where or how they're transformed.

So I built **dbt Flow Lineage** — a VS Code extension that shows column-level lineage with animated data flow.

**What it does:**
- Click any column → traces its full upstream/downstream path across models
- Color-coded edges: passthrough (blue), rename (green), transform (yellow), aggregate (purple)
- Animated particles flowing along edges
- Right-click a .sql file → see only that model's lineage
- Filter by upstream or downstream
- Drag nodes to rearrange, export as PNG

**What you need:**
- Columns defined in `schema.yml`
- Run `dbt compile`
- That's it. SELECT *, CTEs, Jinja all work.

**What it doesn't need:**
- No dbt Cloud
- No paid tier
- No separate server
- No API key

Works on VS Code, Cursor, Windsurf.

Install: Search "dbt Flow Lineage" in VS Code Extensions tab

GitHub (open source, MIT): https://github.com/tripleaceme/dbt-flow-lineage

Screenshots in the repo. Would love feedback — especially on what transformations aren't being detected correctly.

---

## 3. dbt Slack Post

**Channel:** #show-and-tell (or #tools-general)

---

Hey everyone! I built a free, open-source VS Code extension called **dbt Flow Lineage** that adds animated column-level lineage to your dbt project.

**The problem it solves:** dbt docs shows model-level lineage, but when you're debugging a failing column or doing impact analysis, you need to know exactly which upstream column feeds into which downstream column — and whether it's a passthrough, rename, transform, or aggregate.

**How it works:**
1. Define columns in your `schema.yml` (you probably already have this)
2. Run `dbt compile`
3. Open VS Code → the extension auto-detects your project
4. Click any model in the sidebar → see its column-level lineage with animated data flow
5. Click any column → trace its full journey across the DAG

**Features:**
- 4 color-coded transformation types (passthrough, rename, transform, aggregate)
- Upstream/downstream direction filter
- Drag-to-rearrange model nodes
- Export as PNG for documentation
- Works with SELECT *, CTEs, Jinja — no special SQL patterns needed

**Install:** Search "dbt Flow Lineage" in the VS Code Extensions tab (also works on Cursor and Windsurf)

**GitHub:** https://github.com/tripleaceme/dbt-flow-lineage

It's MIT licensed. Would love to hear your feedback — especially edge cases where the column classification gets it wrong. PRs welcome!

---

## Tips for Posting

### LinkedIn
- Add 2-3 screenshots from the `media/` folder (demo-focused-view.png, demo-column-tracing.png, demo-obt-lineage.png)
- Post between Tuesday-Thursday, 8-10am in your timezone
- Reply to your own post with the install link again (LinkedIn algorithm boosts engagement)

### Reddit
- Post on Tuesday or Wednesday morning (US time zones)
- Don't be overly promotional — lead with the problem you solved
- Reply to every comment
- Cross-post to r/analytics if the post does well

### dbt Slack
- Post in #show-and-tell first — it's specifically for sharing tools
- Include a screenshot or GIF inline (Slack supports image uploads)
- Follow up in #tools-general a few days later if there's interest
- Tag relevant people if you know any dbt community members
