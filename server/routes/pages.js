import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Home page
router.get('/', (req, res) => {
  if (req.baseUrl === '/privacy') {
    return res.send(`<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><title>Privacy Policy - Honest UGC</title><link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap\" rel=\"stylesheet\"/><style>:root{--bg:#0b0d12;--panel:#0f1218;--muted:#98a2b3;--text:#e6e8ec;--border:rgba(255,255,255,0.08)}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.max{max-width:900px;margin:0 auto;padding:40px 20px}.card{background:linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);border:1px solid var(--border);border-radius:16px;padding:28px}a{color:#7dd3fc;text-decoration:none}ul{line-height:1.8}</style></head><body><div class=\"max\"><h1>Privacy Policy</h1><div style=\"color:var(--muted);margin-bottom:20px;\">Last updated: ${new Date().toLocaleDateString()}</div><div class=\"card\"><h2>Information We Collect</h2><ul><li>Store information from Shopify (store name, email, plan)</li><li>UGC submissions (customer email, type, content, media)</li><li>Operational data (timestamps, IP for abuse prevention)</li></ul><h2>How We Use Information</h2><ul><li>Process, review, and manage submissions</li><li>Send transactional and reward emails</li><li>Provide support and improve the product</li></ul><h2>Security</h2><p>All data is transmitted over HTTPS. Access to data is limited and audited.</p><h2>Contact</h2><p>Questions? Email <a href=\"mailto:support@honestugc.com\">support@honestugc.com</a>.</p></div><p style=\"margin-top:20px;\"><a href=\"/home\">← Back to Home</a></p></div></body></html>`);
  }
  if (req.baseUrl === '/terms') {
    return res.send(`<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><title>Terms of Service - Honest UGC</title><link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap\" rel=\"stylesheet\"/><style>:root{--bg:#0b0d12;--panel:#0f1218;--muted:#98a2b3;--text:#e6e8ec;--border:rgba(255,255,255,0.08)}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.max{max-width:900px;margin:0 auto;padding:40px 20px}.card{background:linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);border:1px solid var(--border);border-radius:16px;padding:28px}a{color:#7dd3fc;text-decoration:none}ul{line-height:1.8}</style></head><body><div class=\"max\"><h1>Terms of Service</h1><div style=\"color:var(--muted);margin-bottom:20px;\">Last updated: ${new Date().toLocaleDateString()}</div><div class=\"card\"><h2>Agreement</h2><p>By installing or using Honest UGC, you agree to these Terms and our Privacy Policy.</p><h2>Service</h2><p>Honest UGC enables merchants to collect, review, and manage user‑generated content with optional rewards.</p><h2>Merchant Responsibilities</h2><ul><li>Comply with applicable laws and platform policies</li><li>Own or have rights to use/repost submitted content</li><li>Provide accurate information and maintain account security</li></ul><h2>Limitations</h2><p>Provided “as is.” We disclaim implied warranties to the fullest extent permitted by law.</p><h2>Contact</h2><p>Contact <a href=\"mailto:support@honestugc.com\">support@honestugc.com</a>.</p></div><p style=\"margin-top:20px;\"><a href=\"/home\">← Back to Home</a></p></div></body></html>`);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Honest UGC — Get more authentic content from your customers</title>
      <meta name="description" content="Collect high-converting UGC from real customers with automated rewards. Built for Shopify." />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        :root {
          --bg: #0b0d12;
          --panel: #0f1218;
          --muted: #98a2b3;
          --text: #e6e8ec;
          --primary: #7dd3fc;
          --primary-2: #c084fc;
          --accent: #10b981;
          --border: rgba(255,255,255,0.08);
          --card: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
          --grad: radial-gradient(1200px 600px at 10% -10%, rgba(125,211,252,0.12), transparent),
                   radial-gradient(900px 600px at 90% 0%, rgba(192,132,252,0.12), transparent);
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
        a { color: inherit; text-decoration: none; }
        .wrap { position: relative; min-height: 100vh; background: var(--grad); }
        .max { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

        /* Nav */
        nav { position: sticky; top: 0; z-index: 50; background: rgba(11,13,18,0.6); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
        .nav-inner { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; }
        .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: 0.3px; }
        .brand .logo { width: 28px; height: 28px; border-radius: 6px; background: transparent url('/assets/logo.png') center/cover no-repeat; box-shadow: none; }
        .nav-links { display: flex; gap: 22px; align-items: center; }
        .nav-links a { font-weight: 600; }
        .nav-links a:hover { color: var(--text); }
        .install { background: linear-gradient(135deg, #7dd3fc, #c084fc); color: #0b0d12; padding: 10px 16px; border-radius: 10px; font-weight: 800; box-shadow: 0 6px 22px rgba(125,211,252,0.25); }

        /* Hero */
        .hero { padding: 96px 0 64px; }
        .hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 44px; align-items: center; }
        .eyebrow { color: var(--muted); font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px; }
        h1 { font-size: 56px; line-height: 1.05; margin: 10px 0 16px; }
        .hgrad { background: linear-gradient(135deg, #7dd3fc, #c084fc); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .lead { color: var(--muted); font-size: 18px; line-height: 1.7; max-width: 620px; }
        .cta-row { display: flex; gap: 14px; margin-top: 28px; flex-wrap: wrap; }
        .cta-primary { background: linear-gradient(135deg, #7dd3fc, #c084fc); color: #0b0d12; padding: 14px 20px; border-radius: 12px; font-weight: 800; }
        .cta-secondary { border: 1px solid var(--border); padding: 14px 18px; border-radius: 12px; color: var(--text); font-weight: 700; }
        .badges { display: flex; gap: 12px; margin-top: 18px; color: var(--muted); font-size: 12px; }
        .badge { padding: 6px 10px; border: 1px dashed var(--border); border-radius: 999px; white-space: nowrap; }

        /* Visual */
        .panel { position: relative; border: 1px solid var(--border); border-radius: 16px; background: var(--card); padding: 28px 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); min-height: 200px; }
        .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .tile { aspect-ratio: 9/16; border-radius: 10px; background: radial-gradient(200px 120px at 50% 20%, rgba(125,211,252,0.25), transparent), #0b0d12; border: 1px solid var(--border); position: relative; overflow: hidden; padding-bottom: 30px; }
        .tile .tag { position: absolute; left: 10px; top: 10px; font-size: 11px; background: rgba(255,255,255,0.06); border: 1px solid var(--border); padding: 6px 8px; border-radius: 8px; color: var(--muted); }
        .tile .pill { position: absolute; left: 50%; transform: translateX(-50%); bottom: 12px; right: auto; font-size: 10px; line-height: 1.15; white-space: normal; background: #052e2b; color: #34d399; border: 1px solid rgba(52,211,153,0.35); padding: 6px 12px; border-radius: 999px; font-weight: 700; letter-spacing: .2px; text-align: center; }

        /* Trust */
        .trust { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 14px; color: var(--muted); }
        .trust .kpi { background: var(--panel); border: 1px solid var(--border); padding: 14px; border-radius: 12px; text-align: center; }
        .kpi .big { font-size: 24px; font-weight: 800; color: var(--text); }

        /* Features */
        section { padding: 110px 0; }
        #how { padding-top: 100px; padding-bottom: 100px; }
        #pricing { padding-top: 0px; padding-bottom: 100px; }
        .center { text-align: center; }
        .subtitle { color: var(--muted); margin: 6px 0 28px; }
        .f-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .f-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 26px; transition: transform .2s ease; }
        .f-card:hover { transform: translateY(-4px); }
        .icon { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; margin-bottom: 14px; background: linear-gradient(135deg, #7dd3fc33, #c084fc33); border: 1px solid var(--border); }
        .f-card h3 { margin: 6px 0 8px; }
        .f-card p { color: var(--muted); }

        /* Pricing cards container */
        .cards { display:grid; grid-template-columns: repeat(2,1fr); gap:20px; max-width:900px; margin:0 auto; }

        /* Steps */
        .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
        .step { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 22px; text-align: center; position: relative; }
        .num { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg,#7dd3fc,#c084fc); color:#0b0d12; width: 30px; height:30px; display:grid; place-items:center; border-radius:999px; font-weight:800; }

        /* CTA */
        .cta { background: radial-gradient(800px 400px at 50% 0%, rgba(125,211,252,0.15), transparent); text-align: center; border-top: 1px solid var(--border); padding: 120px 0; }
        .cta h2 { font-size: 40px; margin: 0 0 10px; }
        .cta p { color: var(--muted); margin: 0 0 24px; }

        /* Footer */
        footer { border-top: 1px solid var(--border); padding: 42px 0; color: var(--muted); }
        .foot { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 24px; }
        .foot a { color: var(--muted); }

        /* Responsive */
        @media (max-width: 1200px) {
          .hero-grid { gap: 36px; }
        }
        @media (max-width: 1024px) {
          .hero-grid { grid-template-columns: 1fr; text-align: center; }
          .cta-row { justify-content: center; }
          h1 { font-size: 44px; }
          .grid { grid-template-columns: repeat(4, 1fr); }
          .f-grid { grid-template-columns: repeat(2, 1fr); }
          .steps { grid-template-columns: repeat(2, 1fr); }
          section { padding: 96px 0; }
          .panel { margin-top: 10px; }
        }
        @media (max-width: 860px) {
          h1 { font-size: 38px; }
          .grid { grid-template-columns: repeat(3, 1fr); }
          .trust { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 640px) {
          section { padding: 80px 0; }
          .grid { grid-template-columns: repeat(2, 1fr); }
          .tile .pill { font-size: 9px; padding: 6px 10px; }
          .cards { grid-template-columns: 1fr; }
          .steps { grid-template-columns: 1fr; }
          .nav-links { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="wrap">
        <nav>
          <div class="max nav-inner">
            <div class="brand"><div class="logo"></div> Honest UGC</div>
            <div class="nav-links">
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <a href="#pricing">Pricing</a>
              <a class="install" href="https://apps.shopify.com/honest-ugc" target="_blank">Install App</a>
            </div>
          </div>
        </nav>

        <header class="hero">
          <div class="max hero-grid">
            <div>
              <div class="eyebrow">Built for Shopify</div>
              <h1>Turn customers into a <span class="hgrad">constant UGC engine</span></h1>
              <p class="lead">Run lightweight UGC campaigns, collect real photos/videos, and automatically reward your customers. More trust. More content. More sales.</p>
              <div class="cta-row">
                <a class="cta-primary" href="/install">Start free on Shopify</a>
                <a class="cta-secondary" href="#how">See how it works</a>
              </div>
              <div class="badges">
                <div class="badge">No dev work</div>
                <div class="badge">Live in minutes</div>
                <div class="badge">Email + rewards built-in</div>
              </div>
              <div class="trust">
                <div class="kpi"><div class="big">4.9★</div><div>Avg. merchant rating</div></div>
                <div class="kpi"><div class="big">10k+</div><div>UGC collected</div></div>
                <div class="kpi"><div class="big">2x</div><div>More content / month</div></div>
                <div class="kpi"><div class="big">+18%</div><div>Lift in CVR</div></div>
              </div>
            </div>
            <div>
              <div class="panel">
                <div class="grid">
                  <div class="tile"><div class="tag">Video</div><div class="pill">20% off</div></div>
                  <div class="tile"><div class="tag">Photo</div><div class="pill">Gift card</div></div>
                  <div class="tile"><div class="tag">Video</div><div class="pill">Free product</div></div>
                  <div class="tile"><div class="tag">Photo</div><div class="pill">Cash</div></div>
                  <div class="tile"><div class="tag">Video</div><div class="pill">Approved</div></div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section id="features" class="max center">
          <h2>Everything you need to spark UGC</h2>
          <p class="subtitle">Purpose-built for brands that want authentic content without heavy workflows</p>
          <div class="f-grid">
            <div class="f-card">
              <div class="icon">🎯</div>
              <h3>Create targeted jobs</h3>
              <p>Describe the content you want and set rewards. Share a single link—customers do the rest.</p>
            </div>
            <div class="f-card">
              <div class="icon">🎨</div>
              <h3>On-brand submission pages</h3>
              <p>Customize fonts, colors, logos, and example content so every submission feels native to your brand.</p>
            </div>
            <div class="f-card">
              <div class="icon">🧠</div>
              <h3>Built‑in automation</h3>
              <p>Automatic approvals, email templates, and reward delivery (discounts, gift cards, products, cash).</p>
            </div>
            <div class="f-card">
              <div class="icon">📦</div>
              <h3>Simple admin dashboard</h3>
              <p>Review, approve, and manage submissions in seconds. Download media or send rewards with one click.</p>
            </div>
            <div class="f-card">
              <div class="icon">✉️</div>
              <h3>Email that converts</h3>
              <p>Polished, brandable emails at each step—confirmation, approval, rejection, and reward delivery.</p>
            </div>
            <div class="f-card">
              <div class="icon">🛡️</div>
              <h3>Shopify‑native</h3>
              <p>Secure, reliable, and purpose‑built for Shopify merchants. Install, connect, and ship in minutes.</p>
            </div>
          </div>
        </section>

        <section id="how" class="max">
          <div class="center">
            <h2>How it works</h2>
            <p class="subtitle">Launch a UGC pipeline in four steps</p>
          </div>
          <div class="steps">
            <div class="step"><div class="num">1</div><h3>Create a job</h3><p>Define the content and reward.</p></div>
            <div class="step"><div class="num">2</div><h3>Share your link</h3><p>Add to emails, social, or your site.</p></div>
            <div class="step"><div class="num">3</div><h3>Collect submissions</h3><p>Photos and videos roll in.</p></div>
            <div class="step"><div class="num">4</div><h3>Approve & reward</h3><p>Automate or fulfill in a click.</p></div>
          </div>
        </section>

        <section id="pricing" class="max center">
          <h2>Simple pricing</h2>
          <p class="subtitle">Start free. Upgrade as you scale.</p>
          <div class="cards">
            <div class="f-card" style="text-align:center;">
              <div style="font-weight:800;font-size:22px;">Starter</div>
              <div style="font-size:44px;font-weight:800;margin:8px 0;">$19<span style="font-size:14px;color:var(--muted);">/mo</span></div>
              <div style="color:var(--muted);margin:10px 0 18px;">Everything you need to begin collecting UGC</div>
              <a class="cta-secondary" href="/install" style="display:inline-block;">Start free</a>
            </div>
            <div class="f-card" style="text-align:center;border-color:rgba(125,211,252,0.35);box-shadow:0 10px 40px rgba(125,211,252,0.15)">
              <div style="font-weight:800;font-size:22px;">Growth</div>
              <div style="font-size:44px;font-weight:800;margin:8px 0;">$49<span style="font-size:14px;color:var(--muted);">/mo</span></div>
              <div style="color:var(--muted);margin:10px 0 18px;">Unlimited submissions, full customization, priority support</div>
              <a class="cta-primary" href="/install" style="display:inline-block;">Start free</a>
            </div>
          </div>
        </section>

        <section class="cta">
          <div class="max">
            <h2>Ready to turn customers into creators?</h2>
            <p>Install Honest UGC and start collecting content today.</p>
            <div class="cta-row" style="justify-content:center;">
              <a class="cta-primary" href="/install">Install on Shopify</a>
            </div>
          </div>
        </section>

        <footer>
          <div class="max foot">
            <div>
              <div class="brand" style="margin-bottom:8px;"><div class="logo"></div> Honest UGC</div>
              <div>Collect authentic customer content with automated rewards—built for Shopify.</div>
            </div>
            <div>
              <div style="font-weight:700;color:var(--text);margin-bottom:8px;">Product</div>
              <div><a href="#features">Features</a></div>
              <div><a href="#how">How it works</a></div>
              <div><a href="#pricing">Pricing</a></div>
            </div>
            <div>
              <div style="font-weight:700;color:var(--text);margin-bottom:8px;">Legal</div>
              <div><a href="/privacy">Privacy</a></div>
              <div><a href="/terms">Terms</a></div>
            </div>
          </div>
          <div class="max" style="text-align:center;margin-top:18px;color:var(--muted);">© ${new Date().getFullYear()} Honest UGC</div>
        </footer>
      </div>
    </body>
    </html>
  `);
});

// Home page (alternative route)
router.get('/home', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Honest UGC — Get more authentic content from your customers</title>
      <meta name="description" content="Collect high-converting UGC from real customers with automated rewards. Built for Shopify." />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        :root {
          --bg: #0b0d12;
          --panel: #0f1218;
          --muted: #98a2b3;
          --text: #e6e8ec;
          --primary: #7dd3fc;
          --primary-2: #c084fc;
          --accent: #10b981;
          --border: rgba(255,255,255,0.08);
          --card: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
          --grad: radial-gradient(1200px 600px at 10% -10%, rgba(125,211,252,0.12), transparent),
                   radial-gradient(900px 600px at 90% 0%, rgba(192,132,252,0.12), transparent);
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
        a { color: inherit; text-decoration: none; }
        .wrap { position: relative; min-height: 100vh; background: var(--grad); }
        .max { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

        /* Nav */
        nav { position: sticky; top: 0; z-index: 50; background: rgba(11,13,18,0.6); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
        .nav-inner { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; }
        .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: 0.3px; }
        .brand .logo { width: 28px; height: 28px; border-radius: 6px; background: transparent url('/assets/logo.png') center/cover no-repeat; box-shadow: none; }
        .nav-links { display: flex; gap: 22px; align-items: center; }
        .nav-links a { font-weight: 600; }
        .nav-links a:hover { color: var(--text); }
        .install { background: linear-gradient(135deg, #7dd3fc, #c084fc); color: #0b0d12; padding: 10px 16px; border-radius: 10px; font-weight: 800; box-shadow: 0 6px 22px rgba(125,211,252,0.25); }

        /* Hero */
        .hero { padding: 96px 0 64px; }
        .hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 36px; align-items: center; }
        .eyebrow { color: var(--muted); font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px; }
        h1 { font-size: 56px; line-height: 1.05; margin: 10px 0 16px; }
        .hgrad { background: linear-gradient(135deg, #7dd3fc, #c084fc); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .lead { color: var(--muted); font-size: 18px; line-height: 1.7; max-width: 620px; }
        .cta-row { display: flex; gap: 14px; margin-top: 28px; flex-wrap: wrap; }
        .cta-primary { background: linear-gradient(135deg, #7dd3fc, #c084fc); color: #0b0d12; padding: 14px 20px; border-radius: 12px; font-weight: 800; }
        .cta-secondary { border: 1px solid var(--border); padding: 14px 18px; border-radius: 12px; color: var(--text); font-weight: 700; }
        .badges { display: flex; gap: 12px; margin-top: 18px; color: var(--muted); font-size: 12px; }
        .badge { padding: 6px 10px; border: 1px dashed var(--border); border-radius: 999px; }

        /* Visual */
        .panel { position: relative; border: 1px solid var(--border); border-radius: 16px; background: var(--card); padding: 28px 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); min-height: 200px; }
        .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .tile { aspect-ratio: 9/16; border-radius: 10px; background: radial-gradient(200px 120px at 50% 20%, rgba(125,211,252,0.25), transparent), #0b0d12; border: 1px solid var(--border); position: relative; overflow: hidden; padding-bottom: 30px; }
        .tile .tag { position: absolute; left: 10px; top: 10px; font-size: 11px; background: rgba(255,255,255,0.06); border: 1px solid var(--border); padding: 6px 8px; border-radius: 8px; color: var(--muted); }
        .tile .pill { position: absolute; left: 50%; transform: translateX(-50%); bottom: 12px; right: auto; font-size: 10px; line-height: 1.15; white-space: normal; background: #052e2b; color: #34d399; border: 1px solid rgba(52,211,153,0.35); padding: 6px 12px; border-radius: 999px; font-weight: 700; letter-spacing: .2px; text-align: center; }

        /* Trust */
        .trust { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 14px; color: var(--muted); }
        .trust .kpi { background: var(--panel); border: 1px solid var(--border); padding: 14px; border-radius: 12px; text-align: center; }
        .kpi .big { font-size: 24px; font-weight: 800; color: var(--text); }

        /* Features */
        section { padding: 72px 0; }
        .center { text-align: center; }
        .subtitle { color: var(--muted); margin: 6px 0 28px; }
        .f-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        .f-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 26px; transition: transform .2s ease; }
        .f-card:hover { transform: translateY(-4px); }
        .icon { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; margin-bottom: 14px; background: linear-gradient(135deg, #7dd3fc33, #c084fc33); border: 1px solid var(--border); }
        .f-card h3 { margin: 6px 0 8px; }
        .f-card p { color: var(--muted); }

        /* Pricing cards container */
        .cards { display:grid; grid-template-columns: repeat(2,1fr); gap:20px; max-width:900px; margin:0 auto; }

        /* Steps */
        .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
        .step { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 22px; text-align: center; position: relative; }
        .num { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg,#7dd3fc,#c084fc); color:#0b0d12; width: 30px; height:30px; display:grid; place-items:center; border-radius:999px; font-weight:800; }

        /* CTA */
        .cta { background: radial-gradient(800px 400px at 50% 0%, rgba(125,211,252,0.15), transparent); text-align: center; border-top: 1px solid var(--border); padding: 120px 0; }
        .cta h2 { font-size: 40px; margin: 0 0 10px; }
        .cta p { color: var(--muted); margin: 0 0 24px; }

        /* Footer */
        footer { border-top: 1px solid var(--border); padding: 42px 0; color: var(--muted); }
        .foot { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 24px; }
        .foot a { color: var(--muted); }

        /* Responsive */
        @media (max-width: 1200px) {
          .hero-grid { gap: 36px; }
        }
        @media (max-width: 1024px) {
          .hero-grid { grid-template-columns: 1fr; text-align: center; }
          .cta-row { justify-content: center; }
          h1 { font-size: 44px; }
          .grid { grid-template-columns: repeat(4, 1fr); }
          .f-grid { grid-template-columns: repeat(2, 1fr); }
          .steps { grid-template-columns: repeat(2, 1fr); }
          section { padding: 96px 0; }
          .panel { margin-top: 10px; }
        }
        @media (max-width: 860px) {
          h1 { font-size: 38px; }
          .grid { grid-template-columns: repeat(3, 1fr); }
          .trust { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 640px) {
          section { padding: 80px 0; }
          .grid { grid-template-columns: repeat(2, 1fr); }
          .tile .pill { font-size: 9px; padding: 6px 10px; }
          .cards { grid-template-columns: 1fr; }
          .steps { grid-template-columns: 1fr; }
          .nav-links { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="wrap">
        <nav>
          <div class="max nav-inner">
            <div class="brand"><div class="logo"></div> Honest UGC</div>
            <div class="nav-links">
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <a href="#pricing">Pricing</a>
              <a class="install" href="/install">Install App</a>
            </div>
          </div>
        </nav>

        <header class="hero">
          <div class="max hero-grid">
            <div>
              <div class="eyebrow">Built for Shopify</div>
              <h1>Turn customers into a <span class="hgrad">constant UGC engine</span></h1>
              <p class="lead">Run lightweight UGC campaigns, collect real photos/videos, and automatically reward your customers. More trust. More content. More sales.</p>
              <div class="cta-row">
                <a class="cta-primary" href="/install">Start free on Shopify</a>
                <a class="cta-secondary" href="#how">See how it works</a>
              </div>
              <div class="badges">
                <div class="badge">No dev work</div>
                <div class="badge">Live in minutes</div>
                <div class="badge">Email + rewards built-in</div>
              </div>
              <div class="trust">
                <div class="kpi"><div class="big">4.9★</div><div>Avg. merchant rating</div></div>
                <div class="kpi"><div class="big">10k+</div><div>UGC collected</div></div>
                <div class="kpi"><div class="big">2x</div><div>More content / month</div></div>
                <div class="kpi"><div class="big">+18%</div><div>Lift in CVR</div></div>
              </div>
            </div>
            <div>
              <div class="panel">
                <div class="grid">
                  <div class="tile"><div class="tag">Video</div><div class="pill">20% off</div></div>
                  <div class="tile"><div class="tag">Photo</div><div class="pill">Gift card</div></div>
                  <div class="tile"><div class="tag">Video</div><div class="pill">Free product</div></div>
                  <div class="tile"><div class="tag">Photo</div><div class="pill">Cash</div></div>
                  <div class="tile"><div class="tag">Video</div><div class="pill">Approved</div></div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section id="features" class="max center">
          <h2>Everything you need to spark UGC</h2>
          <p class="subtitle">Purpose-built for brands that want authentic content without heavy workflows</p>
          <div class="f-grid">
            <div class="f-card">
              <div class="icon">🎯</div>
              <h3>Create targeted jobs</h3>
              <p>Describe the content you want and set rewards. Share a single link—customers do the rest.</p>
            </div>
            <div class="f-card">
              <div class="icon">🎨</div>
              <h3>On-brand submission pages</h3>
              <p>Customize fonts, colors, logos, and example content so every submission feels native to your brand.</p>
            </div>
            <div class="f-card">
              <div class="icon">🧠</div>
              <h3>Built‑in automation</h3>
              <p>Automatic approvals, email templates, and reward delivery (discounts, gift cards, products, cash).</p>
            </div>
            <div class="f-card">
              <div class="icon">📦</div>
              <h3>Simple admin dashboard</h3>
              <p>Review, approve, and manage submissions in seconds. Download media or send rewards with one click.</p>
            </div>
            <div class="f-card">
              <div class="icon">✉️</div>
              <h3>Email that converts</h3>
              <p>Polished, brandable emails at each step—confirmation, approval, rejection, and reward delivery.</p>
            </div>
            <div class="f-card">
              <div class="icon">🛡️</div>
              <h3>Shopify‑native</h3>
              <p>Secure, reliable, and purpose‑built for Shopify merchants. Install, connect, and ship in minutes.</p>
            </div>
          </div>
        </section>

        <section id="how" class="max">
          <div class="center">
            <h2>How it works</h2>
            <p class="subtitle">Launch a UGC pipeline in four steps</p>
          </div>
          <div class="steps">
            <div class="step"><div class="num">1</div><h3>Create a job</h3><p>Define the content and reward.</p></div>
            <div class="step"><div class="num">2</div><h3>Share your link</h3><p>Add to emails, social, or your site.</p></div>
            <div class="step"><div class="num">3</div><h3>Collect submissions</h3><p>Photos and videos roll in.</p></div>
            <div class="step"><div class="num">4</div><h3>Approve & reward</h3><p>Automate or fulfill in a click.</p></div>
          </div>
        </section>

        <section id="pricing" class="max center">
          <h2>Simple pricing</h2>
          <p class="subtitle">Start free. Upgrade as you scale.</p>
          <div class="cards">
            <div class="f-card" style="text-align:center;">
              <div style="font-weight:800;font-size:22px;">Starter</div>
              <div style="font-size:44px;font-weight:800;margin:8px 0;">$19<span style="font-size:14px;color:var(--muted);">/mo</span></div>
              <div style="color:var(--muted);margin:10px 0 18px;">Everything you need to begin collecting UGC</div>
              <a class="cta-secondary" href="/install" style="display:inline-block;">Start free</a>
            </div>
            <div class="f-card" style="text-align:center;border-color:rgba(125,211,252,0.35);box-shadow:0 10px 40px rgba(125,211,252,0.15)">
              <div style="font-weight:800;font-size:22px;">Growth</div>
              <div style="font-size:44px;font-weight:800;margin:8px 0;">$49<span style="font-size:14px;color:var(--muted);">/mo</span></div>
              <div style="color:var(--muted);margin:10px 0 18px;">Unlimited submissions, full customization, priority support</div>
              <a class="cta-primary" href="/install" style="display:inline-block;">Start free</a>
            </div>
          </div>
        </section>

        <section class="cta">
          <div class="max">
            <h2>Ready to turn customers into creators?</h2>
            <p>Install Honest UGC and start collecting content today.</p>
            <div class="cta-row" style="justify-content:center;">
              <a class="cta-primary" href="/install">Install on Shopify</a>
            </div>
          </div>
        </section>

        <footer>
          <div class="max foot">
            <div>
              <div class="brand" style="margin-bottom:8px;"><div class="logo"></div> Honest UGC</div>
              <div>Collect authentic customer content with automated rewards—built for Shopify.</div>
            </div>
            <div>
              <div style="font-weight:700;color:var(--text);margin-bottom:8px;">Product</div>
              <div><a href="#features">Features</a></div>
              <div><a href="#how">How it works</a></div>
              <div><a href="#pricing">Pricing</a></div>
            </div>
            <div>
              <div style="font-weight:700;color:var(--text);margin-bottom:8px;">Legal</div>
              <div><a href="/privacy">Privacy</a></div>
              <div><a href="/terms">Terms</a></div>
            </div>
          </div>
          <div class="max" style="text-align:center;margin-top:18px;color:var(--muted);">© ${new Date().getFullYear()} Honest UGC</div>
        </footer>
      </div>
    </body>
    </html>
  `);
});

// Privacy Policy page
router.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Privacy Policy - Honest UGC</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        :root{--bg:#0b0d12;--panel:#0f1218;--muted:#98a2b3;--text:#e6e8ec;--border:rgba(255,255,255,0.08)}
        body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
        .max{max-width:900px;margin:0 auto;padding:40px 20px}
        a{color:#7dd3fc;text-decoration:none}
        h1{margin:0 0 8px}
        .card{background:linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);border:1px solid var(--border);border-radius:16px;padding:28px}
        ul{line-height:1.8}
      </style>
    </head>
    <body>
      <div class="max">
        <h1>Privacy Policy</h1>
        <div style="color:var(--muted);margin-bottom:20px;">Last updated: ${new Date().toLocaleDateString()}</div>
        <div class="card">
          <h2>Information We Collect</h2>
          <ul>
            <li>Store information from Shopify (store name, email, plan)</li>
            <li>UGC submissions (customer email, type, content, media)</li>
            <li>Operational data (timestamps, IP for abuse prevention)</li>
          </ul>
          <h2>How We Use Information</h2>
          <ul>
            <li>Process, review, and manage submissions</li>
            <li>Send transactional and reward emails</li>
            <li>Provide support and improve the product</li>
          </ul>
          <h2>Security</h2>
          <p>All data is transmitted over HTTPS. Access to data is limited and audited. Media can be stored in secure object storage (e.g., AWS S3) with signed URLs.</p>
          <h2>Data Retention & Deletion</h2>
          <p>We retain data only as long as needed to operate the service. Merchants can request deletion via support; uninstalling the app initiates shop data cleanup.</p>
          <h2>Contact</h2>
          <p>Questions? Email <a href="mailto:support@honestugc.com">support@honestugc.com</a>.</p>
        </div>
        <p style="margin-top:20px;"><a href="/home">← Back to Home</a></p>
      </div>
    </body>
    </html>
  `);
});

// Terms of Service page
router.get('/terms', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Terms of Service - Honest UGC</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        :root{--bg:#0b0d12;--panel:#0f1218;--muted:#98a2b3;--text:#e6e8ec;--border:rgba(255,255,255,0.08)}
        body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
        .max{max-width:900px;margin:0 auto;padding:40px 20px}
        a{color:#7dd3fc;text-decoration:none}
        h1{margin:0 0 8px}
        .card{background:linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);border:1px solid var(--border);border-radius:16px;padding:28px}
        ul{line-height:1.8}
      </style>
    </head>
    <body>
      <div class="max">
        <h1>Terms of Service</h1>
        <div style="color:var(--muted);margin-bottom:20px;">Last updated: ${new Date().toLocaleDateString()}</div>
        <div class="card">
          <h2>Agreement</h2>
          <p>By installing or using Honest UGC, you agree to these Terms and our Privacy Policy.</p>
          <h2>Service</h2>
          <p>Honest UGC enables merchants to collect, review, and manage user‑generated content with optional rewards.</p>
          <h2>Merchant Responsibilities</h2>
          <ul>
            <li>Comply with all applicable laws and platform policies</li>
            <li>Own or have rights to use/repost submitted content</li>
            <li>Provide accurate information and maintain account security</li>
          </ul>
          <h2>Limitations</h2>
          <p>Services are provided “as is.” We disclaim implied warranties to the fullest extent permitted by law. We are not liable for indirect or consequential damages.</p>
          <h2>Termination</h2>
          <p>You may uninstall at any time. We may suspend access for abuse, non‑payment, or security issues.</p>
          <h2>Contact</h2>
          <p>For questions about these terms, contact <a href="mailto:support@honestugc.com">support@honestugc.com</a>.</p>
        </div>
        <p style="margin-top:20px;"><a href="/home">← Back to Home</a></p>
      </div>
    </body>
    </html>
  `);
});

export const pageRoutes = router;