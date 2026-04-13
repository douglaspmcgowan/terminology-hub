import OpenAI from "openai";
import { Octokit } from "@octokit/rest";

const REPO_OWNER = process.env.REPO_OWNER || "douglaspmcgowan";
const REPO_NAME  = process.env.REPO_NAME  || "terminology-hub";
const BRANCH     = process.env.REPO_BRANCH || "main";

const DISCIPLINES = [
  { key: "ml",    label: "Machine Learning",       tag: "tag-ml" },
  { key: "dl",    label: "Deep Learning",          tag: "tag-dl" },
  { key: "gen",   label: "Generative",             tag: "tag-gen" },
  { key: "rl",    label: "Reinforcement Learning", tag: "tag-rl" },
  { key: "stats", label: "Statistics",             tag: "tag-stats" },
  { key: "info",  label: "Information Theory",     tag: "tag-info" }
];

function slugify(s) {
  return s.toLowerCase().trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderTagsHtml(disciplines) {
  return disciplines.map(k => {
    const d = DISCIPLINES.find(x => x.key === k);
    if (!d) return "";
    return `<span class="tag ${d.tag}">${d.label}</span>`;
  }).join(" ");
}

// ---- Page template ---------------------------------------------------------

function renderTermPage(t) {
  const tags = renderTagsHtml(t.disciplines || []);
  const examples = (t.examples || []).map(e =>
    `<div class="example-card">
       <h4>${escapeHtml(e.title)}</h4>
       <p>${escapeHtml(e.description)}</p>
     </div>`).join("\n        ");
  const related = (t.related || []).map(r =>
    `<a class="related-card" href="#">
       <strong>${escapeHtml(r.title)}</strong>
       <span>${escapeHtml(r.description)}</span>
     </a>`).join("\n        ");
  const reading = (t.further_reading || []).map(r =>
    `<li>${escapeHtml(r)}</li>`).join("\n        ");
  const keyterms = (t.key_terms || []).map(k =>
    `<dt>${escapeHtml(k.term)}</dt><dd>${escapeHtml(k.definition)}</dd>`).join("\n        ");

  // Diagram: accept either raw SVG markup or fall back to a simple placeholder.
  const diagram = (t.svg_diagram && t.svg_diagram.trim().startsWith("<svg"))
    ? t.svg_diagram
    : `<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
         <rect x="20" y="60" width="560" height="80" rx="10"
               fill="#faf8f3" stroke="#3d5a80" stroke-width="1.5"/>
         <text x="300" y="108" text-anchor="middle"
               font-family="Iowan Old Style, Georgia, serif" font-size="18" fill="#293241">
           ${escapeHtml(t.title)}
         </text>
       </svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(t.title)} — Terminology Hub</title>
<link rel="stylesheet" href="../css/styles.css" />
</head>
<body>

<header class="site-header">
  <div class="container">
    <a href="../index.html" class="site-logo">Terminology Hub</a>
    <nav class="site-nav">
      <a href="../index.html#terms">All Terms</a>
      <a href="../index.html#disciplines">Disciplines</a>
    </nav>
  </div>
</header>

<main class="container">
  <div class="term-page">

    <article class="term-main">

      <div class="breadcrumb">
        <a href="../index.html">Home</a> &rsaquo;
        <a href="../index.html#terms">Terms</a> &rsaquo;
        ${escapeHtml(t.title)}
      </div>

      <h1>${escapeHtml(t.title)}</h1>

      <div>${tags}</div>

      <div class="tldr">
        <strong>TL;DR</strong>
        <p>${escapeHtml(t.tldr || "")}</p>
      </div>

      <h2 id="overview">Overview</h2>
      ${t.overview_html || ""}

      <h2 id="diagram">Visual</h2>
      <figure>
        ${diagram}
        <figcaption>${escapeHtml(t.diagram_caption || t.title)}</figcaption>
      </figure>

      <h2 id="how">How It Works</h2>
      ${t.how_it_works_html || ""}

      ${keyterms ? `<dl class="keyterms">${keyterms}</dl>` : ""}

      <h2 id="examples">Real-World Examples</h2>
      <div class="example-grid">
        ${examples}
      </div>

      ${t.math_html ? `<h2 id="math">The Math</h2>${t.math_html}` : ""}

      <h2 id="related">Related Terms</h2>
      <div class="related-grid">
        ${related}
      </div>

      <h2 id="reading">Further Reading</h2>
      <ul>
        ${reading}
      </ul>

    </article>

    <aside class="toc">
      <h4>On this page</h4>
      <ul>
        <li><a href="#overview">Overview</a></li>
        <li><a href="#diagram">Visual</a></li>
        <li><a href="#how">How it works</a></li>
        <li><a href="#examples">Real-world uses</a></li>
        ${t.math_html ? `<li><a href="#math">The math</a></li>` : ""}
        <li><a href="#related">Related terms</a></li>
        <li><a href="#reading">Further reading</a></li>
      </ul>
    </aside>

  </div>
</main>

<footer>
  <div class="container">
    <a href="../index.html">&larr; Back to all terms</a>
  </div>
</footer>

</body>
</html>
`;
}

function renderIndexCard(t) {
  const tags = renderTagsHtml(t.disciplines || []);
  const search = (t.disciplines || []).concat([t.title]).join(" ").toLowerCase();
  const dataTags = (t.disciplines || []).join(" ");
  return `
      <a class="term-card" href="terms/${t.slug}.html"
         data-tags="${dataTags}"
         data-search="${escapeHtml(search)}">
        ${tags}
        <h3>${escapeHtml(t.title)}</h3>
        <p>${escapeHtml(t.card_description || t.tldr || "")}</p>
      </a>
`;
}

function injectCardsIntoIndex(indexHtml, newCards) {
  // Find the closing </div> of the term-grid: it's the </div> that directly
  // precedes the </section> that closes id="terms".
  const gridOpenIdx = indexHtml.indexOf('id="term-grid"');
  if (gridOpenIdx === -1) throw new Error("term-grid not found");
  // Locate the matching </div> — the first </div> whose next non-empty
  // sibling is </section>.
  const re = /<\/div>\s*<\/section>/g;
  re.lastIndex = gridOpenIdx;
  const match = re.exec(indexHtml);
  if (!match) throw new Error("closing </div></section> not found after term-grid");
  const insertAt = match.index;
  return indexHtml.slice(0, insertAt) + newCards + indexHtml.slice(insertAt);
}

// ---- OpenAI prompts --------------------------------------------------------

const SYSTEM_PROMPT = `You are helping build a reference site of machine-learning / research terms.
Return a JSON object: { "terms": [ <TermSpec>, ... ] }.

Each TermSpec has these fields (all strings unless noted):
  title               – human-readable name (e.g. "Gradient Descent")
  slug                – URL slug, lowercase-with-dashes
  disciplines         – array of keys from: ml, dl, gen, rl, stats, info
  tldr                – 1-3 sentence plain-language summary
  card_description    – 1-sentence description for the homepage card (under 160 chars)
  overview_html       – inner HTML, 1-3 <p> paragraphs, plain language
  how_it_works_html   – inner HTML, <p> or <ul>, more technical
  key_terms           – array of {term, definition} (3-6 items)
  svg_diagram         – a full <svg viewBox="0 0 800 300" ...>...</svg> string that illustrates the concept;
                        use colors #3d5a80, #98c1d9, #ee6c4d, #293241, #faf8f3;
                        use font-family "Iowan Old Style, Georgia, serif" for labels;
                        keep under 2KB; if unsure, draw a simple labeled diagram.
  diagram_caption     – 1 sentence
  examples            – array of {title, description} (4-6 real-world uses)
  math_html           – OPTIONAL inner HTML with equations wrapped in <div class="math-block">...</div>
  related             – array of {title, description} (5-8 related concepts)
  further_reading     – array of plain strings (canonical papers or textbooks)

Write with a warm, tutorial tone — like the best science explainers. Be precise but inviting.`;

async function generateTerms(openai, userRequest) {
  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content:
        `The user wants pages for the following. Read this and extract a list of terms to generate:\n\n"""\n${userRequest}\n"""\n\nReturn JSON with one TermSpec per term.` }
    ]
  });
  const data = JSON.parse(resp.choices[0].message.content);
  if (!Array.isArray(data.terms)) throw new Error("OpenAI did not return a terms array");
  return data.terms;
}

// ---- GitHub commit ---------------------------------------------------------

async function commitFiles(octokit, files, message) {
  const { data: ref } = await octokit.git.getRef({
    owner: REPO_OWNER, repo: REPO_NAME, ref: `heads/${BRANCH}`
  });
  const baseSha = ref.object.sha;
  const { data: baseCommit } = await octokit.git.getCommit({
    owner: REPO_OWNER, repo: REPO_NAME, commit_sha: baseSha
  });

  const blobs = await Promise.all(files.map(async f => {
    const { data: blob } = await octokit.git.createBlob({
      owner: REPO_OWNER, repo: REPO_NAME,
      content: Buffer.from(f.content, "utf8").toString("base64"),
      encoding: "base64"
    });
    return { path: f.path, sha: blob.sha, mode: "100644", type: "blob" };
  }));

  const { data: tree } = await octokit.git.createTree({
    owner: REPO_OWNER, repo: REPO_NAME,
    base_tree: baseCommit.tree.sha,
    tree: blobs
  });
  const { data: commit } = await octokit.git.createCommit({
    owner: REPO_OWNER, repo: REPO_NAME,
    message, tree: tree.sha, parents: [baseSha]
  });
  await octokit.git.updateRef({
    owner: REPO_OWNER, repo: REPO_NAME, ref: `heads/${BRANCH}`, sha: commit.sha
  });
  return commit.sha;
}

async function getFile(octokit, path) {
  const { data } = await octokit.repos.getContent({
    owner: REPO_OWNER, repo: REPO_NAME, path, ref: BRANCH
  });
  return Buffer.from(data.content, "base64").toString("utf8");
}

// ---- Handler ---------------------------------------------------------------

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const request = (body && body.request) || "";
    if (!request.trim()) return res.status(400).json({ error: "Missing 'request' field" });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const octokit = new Octokit({ auth: process.env.GH_TOKEN });

    // 1) Ask OpenAI for all the term specs in a single call.
    const terms = await generateTerms(openai, request);

    // 2) Normalize slugs and render files.
    const files = [];
    const cards = [];
    for (const t of terms) {
      t.slug = t.slug ? slugify(t.slug) : slugify(t.title);
      files.push({
        path: `terms/${t.slug}.html`,
        content: renderTermPage(t)
      });
      cards.push(renderIndexCard(t));
    }

    // 3) Update index.html with new cards.
    const currentIndex = await getFile(octokit, "index.html");
    const newIndex = injectCardsIntoIndex(currentIndex, cards.join(""));
    files.push({ path: "index.html", content: newIndex });

    // 4) Commit everything in one commit.
    const titles = terms.map(t => t.title).join(", ");
    const sha = await commitFiles(octokit, files, `Add term pages: ${titles}`);

    return res.json({
      ok: true,
      commit: sha,
      terms: terms.map(t => ({ title: t.title, slug: t.slug, url: `/terms/${t.slug}.html` }))
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
