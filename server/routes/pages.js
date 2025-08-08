import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Home page
router.get('/', (req, res) => {

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Honest UGC - Turn Customer Love Into Authentic Content</title>
        <meta name="description" content="The easiest way to collect authentic user-generated content from your customers. Boost trust, increase conversions, and build a library of social proof.">
        
        <!-- Fonts -->
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            :root {
                --primary: #008060;
                --primary-dark: #006e52;
                --secondary: #f6f6f7;
                --text-dark: #202223;
                --text-light: #6d7175;
                --accent: #5c6ac4;
                --success: #008060;
                --gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: var(--text-dark);
                overflow-x: hidden;
            }
            
            /* Navigation */
            nav {
                position: fixed;
                top: 0;
                width: 100%;
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(10px);
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                z-index: 1000;
                padding: 20px 0;
            }
            
            .nav-container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .logo {
                font-size: 24px;
                font-weight: 700;
                color: var(--primary);
                text-decoration: none;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .logo::before {
                content: "✨";
                font-size: 28px;
            }
            
            .nav-links {
                display: flex;
                gap: 30px;
                align-items: center;
            }
            
            .nav-links a {
                color: var(--text-dark);
                text-decoration: none;
                font-weight: 500;
                transition: color 0.3s;
            }
            
            .nav-links a:hover {
                color: var(--primary);
            }
            
            .cta-button {
                background: var(--primary);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                transition: all 0.3s;
                display: inline-block;
            }
            
            .cta-button:hover {
                background: var(--primary-dark);
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(0, 128, 96, 0.2);
            }
            
            /* Hero Section */
            .hero {
                padding: 140px 20px 80px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                position: relative;
                overflow: hidden;
            }
            
            .hero::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: url('data:image/svg+xml,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" fill="none" stroke="white" stroke-width="0.5" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
                opacity: 0.3;
            }
            
            .hero-content {
                max-width: 1200px;
                margin: 0 auto;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 60px;
                align-items: center;
                position: relative;
                z-index: 1;
            }
            
            .hero-text h1 {
                font-size: 56px;
                font-weight: 800;
                line-height: 1.1;
                margin-bottom: 24px;
                color: white;
            }
            
            .gradient-text {
                background: linear-gradient(135deg, #ffd89b 0%, #19547b 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .hero-text p {
                font-size: 20px;
                margin-bottom: 32px;
                color: rgba(255, 255, 255, 0.9);
                line-height: 1.6;
            }
            
            .hero-buttons {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
            }
            
            .btn-primary {
                background: white;
                color: var(--primary);
                padding: 16px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                font-size: 18px;
                transition: all 0.3s;
                display: inline-block;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 15px 40px rgba(0,0,0,0.3);
            }
            
            .btn-secondary {
                background: transparent;
                color: white;
                padding: 16px 32px;
                border: 2px solid white;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                font-size: 18px;
                transition: all 0.3s;
                display: inline-block;
            }
            
            .btn-secondary:hover {
                background: white;
                color: var(--primary);
            }
            
            .hero-visual {
                position: relative;
            }
            
            .floating-card {
                background: white;
                border-radius: 16px;
                padding: 24px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                position: absolute;
                animation: float 6s ease-in-out infinite;
            }
            
            @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-20px); }
            }
            
            .card-1 {
                top: 20px;
                right: 20px;
                animation-delay: 0s;
            }
            
            .card-2 {
                bottom: 40px;
                left: 20px;
                animation-delay: 2s;
            }
            
            .card-3 {
                top: 50%;
                right: 30%;
                animation-delay: 4s;
            }
            
            .floating-card .emoji {
                font-size: 32px;
                margin-bottom: 8px;
            }
            
            .floating-card .label {
                font-size: 14px;
                color: var(--text-light);
                margin-bottom: 4px;
            }
            
            .floating-card .value {
                font-size: 24px;
                font-weight: 700;
                color: var(--primary);
            }
            
            /* Features Section */
            .features {
                padding: 80px 20px;
                background: white;
            }
            
            .section-header {
                text-align: center;
                max-width: 800px;
                margin: 0 auto 60px;
            }
            
            .section-header h2 {
                font-size: 42px;
                font-weight: 700;
                margin-bottom: 16px;
                color: var(--text-dark);
            }
            
            .section-header p {
                font-size: 20px;
                color: var(--text-light);
            }
            
            .features-grid {
                max-width: 1200px;
                margin: 0 auto;
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 40px;
            }
            
            .feature-card {
                text-align: center;
                padding: 40px 30px;
                border-radius: 16px;
                background: var(--secondary);
                transition: all 0.3s;
                position: relative;
                overflow: hidden;
            }
            
            .feature-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 4px;
                background: var(--gradient);
                transform: scaleX(0);
                transition: transform 0.3s;
            }
            
            .feature-card:hover {
                transform: translateY(-8px);
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            }
            
            .feature-card:hover::before {
                transform: scaleX(1);
            }
            
            .feature-icon {
                font-size: 48px;
                margin-bottom: 20px;
            }
            
            .feature-card h3 {
                font-size: 24px;
                margin-bottom: 12px;
                color: var(--text-dark);
            }
            
            .feature-card p {
                font-size: 16px;
                color: var(--text-light);
                line-height: 1.6;
            }
            
            /* How it Works */
            .how-it-works {
                padding: 80px 20px;
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            }
            
            .steps-container {
                max-width: 1200px;
                margin: 0 auto;
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 30px;
            }
            
            .step {
                background: white;
                padding: 30px;
                border-radius: 16px;
                text-align: center;
                position: relative;
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            }
            
            .step-number {
                position: absolute;
                top: -20px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--gradient);
                color: white;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 18px;
            }
            
            .step h3 {
                margin: 20px 0 12px;
                font-size: 20px;
                color: var(--text-dark);
            }
            
            .step p {
                color: var(--text-light);
                font-size: 15px;
            }
            
            /* Pricing Section */
            .pricing {
                padding: 80px 20px;
                background: white;
            }
            
            .pricing-cards {
                max-width: 1000px;
                margin: 0 auto;
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 40px;
            }
            
            .pricing-card {
                background: white;
                border: 2px solid #e5e5e5;
                border-radius: 16px;
                padding: 40px;
                text-align: center;
                position: relative;
                transition: all 0.3s;
            }
            
            .pricing-card.featured {
                border-color: var(--primary);
                transform: scale(1.05);
                box-shadow: 0 20px 60px rgba(0, 128, 96, 0.2);
            }
            
            .badge {
                position: absolute;
                top: -12px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--primary);
                color: white;
                padding: 4px 16px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
            }
            
            .price {
                font-size: 48px;
                font-weight: 700;
                color: var(--text-dark);
                margin: 20px 0;
            }
            
            .price span {
                font-size: 20px;
                color: var(--text-light);
                font-weight: 400;
            }
            
            .pricing-features {
                list-style: none;
                margin: 30px 0;
            }
            
            .pricing-features li {
                padding: 12px 0;
                color: var(--text-dark);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            
            .pricing-features li::before {
                content: "✓";
                color: var(--success);
                font-weight: 700;
            }
            
            /* Testimonials */
            .testimonials {
                padding: 80px 20px;
                background: var(--secondary);
            }
            
            .testimonials-grid {
                max-width: 1200px;
                margin: 0 auto;
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 30px;
            }
            
            .testimonial {
                background: white;
                padding: 30px;
                border-radius: 16px;
                box-shadow: 0 5px 20px rgba(0,0,0,0.08);
            }
            
            .stars {
                color: #ffd700;
                font-size: 20px;
                margin-bottom: 16px;
            }
            
            .testimonial-text {
                color: var(--text-dark);
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 20px;
            }
            
            .testimonial-author {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .author-avatar {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: var(--gradient);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 600;
                font-size: 18px;
            }
            
            .author-info h4 {
                font-size: 16px;
                color: var(--text-dark);
                margin-bottom: 4px;
            }
            
            .author-info p {
                font-size: 14px;
                color: var(--text-light);
            }
            
            /* CTA Section */
            .cta-section {
                padding: 100px 20px;
                background: var(--gradient);
                text-align: center;
                position: relative;
                overflow: hidden;
            }
            
            .cta-section::before {
                content: '';
                position: absolute;
                top: -50%;
                right: -50%;
                width: 200%;
                height: 200%;
                background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                animation: rotate 30s linear infinite;
            }
            
            @keyframes rotate {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .cta-content {
                position: relative;
                z-index: 1;
                max-width: 800px;
                margin: 0 auto;
            }
            
            .cta-content h2 {
                font-size: 48px;
                color: white;
                margin-bottom: 20px;
                font-weight: 700;
            }
            
            .cta-content p {
                font-size: 20px;
                color: rgba(255,255,255,0.9);
                margin-bottom: 32px;
            }
            
            /* Footer */
            footer {
                background: var(--text-dark);
                color: white;
                padding: 60px 20px 30px;
            }
            
            .footer-content {
                max-width: 1200px;
                margin: 0 auto;
                display: grid;
                grid-template-columns: 2fr 1fr 1fr 1fr;
                gap: 40px;
                margin-bottom: 40px;
            }
            
            .footer-section h3 {
                margin-bottom: 16px;
                font-size: 18px;
            }
            
            .footer-section p {
                color: rgba(255,255,255,0.7);
                line-height: 1.6;
            }
            
            .footer-section ul {
                list-style: none;
            }
            
            .footer-section ul li {
                margin-bottom: 12px;
            }
            
            .footer-section ul li a {
                color: rgba(255,255,255,0.7);
                text-decoration: none;
                transition: color 0.3s;
            }
            
            .footer-section ul li a:hover {
                color: white;
            }
            
            .footer-bottom {
                border-top: 1px solid rgba(255,255,255,0.1);
                padding-top: 30px;
                text-align: center;
                color: rgba(255,255,255,0.5);
            }
            
            /* Mobile Responsive */
            @media (max-width: 768px) {
                .nav-links {
                    display: none;
                }
                
                .hero-content {
                    grid-template-columns: 1fr;
                    text-align: center;
                }
                
                .hero-text h1 {
                    font-size: 36px;
                }
                
                .hero-visual {
                    display: none;
                }
                
                .features-grid,
                .steps-container,
                .testimonials-grid {
                    grid-template-columns: 1fr;
                }
                
                .pricing-cards {
                    grid-template-columns: 1fr;
                }
                
                .footer-content {
                    grid-template-columns: 1fr;
                    text-align: center;
                }
            }
        </style>
    </head>
    <body>
        <!-- Navigation -->
        <nav>
            <div class="nav-container">
                <a href="/" class="logo">Honest UGC</a>
                <div class="nav-links">
                    <a href="#features">Features</a>
                    <a href="#how-it-works">How it Works</a>
                    <a href="#pricing">Pricing</a>
                    <a href="/install" class="cta-button">Install App</a>
                </div>
            </div>
        </nav>

        <!-- Hero Section -->
        <section class="hero">
            <div class="hero-content">
                <div class="hero-text">
                    <h1>Turn Customer Love Into <span class="gradient-text">Authentic Content</span></h1>
                    <p>The easiest way to collect user-generated content from your customers. Boost trust, increase conversions, and build a library of authentic social proof.</p>
                    <div class="hero-buttons">
                        <a href="/install" class="btn-primary">Start Free Trial</a>
                        <a href="#how-it-works" class="btn-secondary">See How It Works</a>
                    </div>
                </div>
                <div class="hero-visual">
                    <div class="floating-card card-1">
                        <div class="emoji">📸</div>
                        <div class="label">Submissions Today</div>
                        <div class="value">24</div>
                    </div>
                    <div class="floating-card card-2">
                        <div class="emoji">⭐</div>
                        <div class="label">Avg Rating</div>
                        <div class="value">4.9</div>
                    </div>
                    <div class="floating-card card-3">
                        <div class="emoji">🎁</div>
                        <div class="label">Rewards Sent</div>
                        <div class="value">156</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Features Section -->
        <section class="features" id="features">
            <div class="section-header">
                <h2>Everything You Need to Collect Amazing UGC</h2>
                <p>Powerful features that make collecting and managing user-generated content effortless</p>
            </div>
            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-icon">🎯</div>
                    <h3>Smart Job Creation</h3>
                    <p>Create targeted UGC campaigns with specific requirements and automatic reward distribution</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">🎨</div>
                    <h3>Customizable Forms</h3>
                    <p>Match your brand perfectly with fully customizable submission forms and landing pages</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">🎁</div>
                    <h3>Automatic Rewards</h3>
                    <p>Send discount codes, gift cards, or free products automatically when content is approved</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">📊</div>
                    <h3>Easy Management</h3>
                    <p>Review, approve, and manage all submissions from one simple dashboard</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">✉️</div>
                    <h3>Email Automation</h3>
                    <p>Keep customers engaged with automated confirmation and reward emails</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">🚀</div>
                    <h3>Quick Setup</h3>
                    <p>Get started in minutes with our simple installation and setup process</p>
                </div>
            </div>
        </section>

        <!-- How It Works -->
        <section class="how-it-works" id="how-it-works">
            <div class="section-header">
                <h2>How It Works</h2>
                <p>Four simple steps to start collecting authentic content from your customers</p>
            </div>
            <div class="steps-container">
                <div class="step">
                    <div class="step-number">1</div>
                    <h3>Create a Job</h3>
                    <p>Set up a UGC campaign with your requirements and rewards</p>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <h3>Share the Link</h3>
                    <p>Send your custom submission link to customers via email or social</p>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <h3>Collect Content</h3>
                    <p>Customers submit photos and videos through your branded form</p>
                </div>
                <div class="step">
                    <div class="step-number">4</div>
                    <h3>Send Rewards</h3>
                    <p>Approve content and automatically send rewards to contributors</p>
                </div>
            </div>
        </section>

        <!-- Pricing Section -->
        <section class="pricing" id="pricing">
            <div class="section-header">
                <h2>Simple, Transparent Pricing</h2>
                <p>Choose the plan that works best for your business</p>
            </div>
            <div class="pricing-cards">
                <div class="pricing-card">
                    <h3>Starter</h3>
                    <div class="price">$19<span>/month</span></div>
                    <ul class="pricing-features">
                        <li>Up to 50 submissions/month</li>
                        <li>Unlimited UGC jobs</li>
                        <li>Email automation</li>
                        <li>Basic customization</li>
                        <li>Discount/gift card rewards</li>
                    </ul>
                    <a href="/install" class="cta-button" style="width: 100%;">Start Free Trial</a>
                </div>
                <div class="pricing-card featured">
                    <div class="badge">Most Popular</div>
                    <h3>Growth</h3>
                    <div class="price">$49<span>/month</span></div>
                    <ul class="pricing-features">
                        <li>Unlimited submissions</li>
                        <li>Unlimited UGC jobs</li>
                        <li>Advanced customization</li>
                        <li>Priority support</li>
                        <li>All reward types</li>
                        <li>Custom branding</li>
                    </ul>
                    <a href="/install" class="cta-button" style="width: 100%;">Start Free Trial</a>
                </div>
            </div>
        </section>

        <!-- Testimonials -->
        <section class="testimonials">
            <div class="section-header">
                <h2>Loved by Shopify Merchants</h2>
                <p>See what store owners are saying about Honest UGC</p>
            </div>
            <div class="testimonials-grid">
                <div class="testimonial">
                    <div class="stars">★★★★★</div>
                    <p class="testimonial-text">"Game changer! We've collected over 200 pieces of content in just 2 months. Our conversion rate is up 23%."</p>
                    <div class="testimonial-author">
                        <div class="author-avatar">SB</div>
                        <div class="author-info">
                            <h4>Sarah Bennett</h4>
                            <p>Fashion Store Owner</p>
                        </div>
                    </div>
                </div>
                <div class="testimonial">
                    <div class="stars">★★★★★</div>
                    <p class="testimonial-text">"So easy to use! The automatic rewards feature saves us hours every week. Highly recommend!"</p>
                    <div class="testimonial-author">
                        <div class="author-avatar">MJ</div>
                        <div class="author-info">
                            <h4>Mike Johnson</h4>
                            <p>Beauty Brand Founder</p>
                        </div>
                    </div>
                </div>
                <div class="testimonial">
                    <div class="stars">★★★★★</div>
                    <p class="testimonial-text">"Finally, a UGC solution that actually works! Setup took 5 minutes and we had our first submission within an hour."</p>
                    <div class="testimonial-author">
                        <div class="author-avatar">EL</div>
                        <div class="author-info">
                            <h4>Emma Liu</h4>
                            <p>Home Decor Store</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- CTA Section -->
        <section class="cta-section">
            <div class="cta-content">
                <h2>Ready to Start Collecting Authentic UGC?</h2>
                <p>Join hundreds of Shopify stores using Honest UGC to build trust and boost sales</p>
                <a href="/install" class="btn-primary" style="font-size: 20px; padding: 18px 40px;">Start Your Free Trial</a>
            </div>
        </section>

        <!-- Footer -->
        <footer>
            <div class="footer-content">
                <div class="footer-section">
                    <h3>Honest UGC</h3>
                    <p>The easiest way to collect and manage user-generated content for your Shopify store. Build trust, increase conversions, and create authentic connections with your customers.</p>
                </div>
                <div class="footer-section">
                    <h3>Product</h3>
                    <ul>
                        <li><a href="#features">Features</a></li>
                        <li><a href="#pricing">Pricing</a></li>
                        <li><a href="#how-it-works">How it Works</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h3>Support</h3>
                    <ul>
                        <li><a href="mailto:support@honestugc.com">Contact Us</a></li>
                        <li><a href="/docs">Documentation</a></li>
                        <li><a href="/faq">FAQ</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h3>Legal</h3>
                    <ul>
                        <li><a href="/privacy">Privacy Policy</a></li>
                        <li><a href="/terms">Terms of Service</a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2024 Honest UGC. All rights reserved. Built with ❤️ for Shopify merchants.</p>
            </div>
        </footer>
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
        .brand .logo { width: 28px; height: 28px; border-radius: 8px; background: conic-gradient(from 180deg, #7dd3fc, #c084fc, #7dd3fc); box-shadow: 0 0 24px rgba(125,211,252,0.35); }
        .nav-links { display: flex; gap: 22px; align-items: center; }
        .nav-links a { color: var(--muted); font-weight: 600; }
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
        .panel { position: relative; border: 1px solid var(--border); border-radius: 16px; background: var(--card); padding: 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
        .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
        .tile { aspect-ratio: 9/16; border-radius: 10px; background: radial-gradient(200px 120px at 50% 20%, rgba(125,211,252,0.25), transparent), #0b0d12; border: 1px solid var(--border); position: relative; overflow: hidden; }
        .tile .tag { position: absolute; left: 10px; top: 10px; font-size: 11px; background: rgba(255,255,255,0.06); border: 1px solid var(--border); padding: 6px 8px; border-radius: 8px; color: var(--muted); }
        .tile .pill { position: absolute; right: 10px; bottom: 10px; font-size: 11px; background: #052e2b; color: #34d399; border: 1px solid rgba(52,211,153,0.35); padding: 6px 8px; border-radius: 999px; font-weight: 700; }

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

        /* Steps */
        .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
        .step { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 22px; text-align: center; position: relative; }
        .num { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg,#7dd3fc,#c084fc); color:#0b0d12; width: 30px; height:30px; display:grid; place-items:center; border-radius:999px; font-weight:800; }

        /* CTA */
        .cta { background: radial-gradient(800px 400px at 50% 0%, rgba(125,211,252,0.15), transparent); text-align: center; border-top: 1px solid var(--border); }
        .cta h2 { font-size: 40px; margin: 0 0 10px; }
        .cta p { color: var(--muted); margin: 0 0 24px; }

        /* Footer */
        footer { border-top: 1px solid var(--border); padding: 42px 0; color: var(--muted); }
        .foot { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 24px; }
        .foot a { color: var(--muted); }

        @media (max-width: 960px) {
          .hero-grid { grid-template-columns: 1fr; }
          h1 { font-size: 38px; }
          .f-grid { grid-template-columns: 1fr; }
          .steps { grid-template-columns: 1fr 1fr; }
          .foot { grid-template-columns: 1fr; }
          .trust { grid-template-columns: 1fr 1fr; }
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
                  <div class="tile"><div class="tag">Photo</div><div class="pill">Reward ready</div></div>
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
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px;max-width:900px;margin:0 auto;">
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
    <html>
      <head>
        <title>Privacy Policy - Honest UGC</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.6;
            color: #333;
          }
          h1, h2 { color: #202223; }
          a { color: #008060; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>Privacy Policy</h1>
        <p>Last updated: ${new Date().toLocaleDateString()}</p>
        
        <h2>Information We Collect</h2>
        <p>Honest UGC collects information necessary to provide our services:</p>
        <ul>
          <li>Store information from Shopify (store name, email)</li>
          <li>Customer submissions (email, content, media files)</li>
          <li>Usage data to improve our services</li>
        </ul>
        
        <h2>How We Use Information</h2>
        <p>We use collected information to:</p>
        <ul>
          <li>Process and manage UGC submissions</li>
          <li>Send reward emails to customers</li>
          <li>Provide customer support</li>
          <li>Improve our services</li>
        </ul>
        
        <h2>Data Security</h2>
        <p>We implement appropriate security measures to protect your data. All data is transmitted over secure HTTPS connections.</p>
        
        <h2>Contact Us</h2>
        <p>If you have questions about this privacy policy, please contact us through your Shopify admin.</p>
        
        <p><a href="/">← Back to Home</a></p>
      </body>
    </html>
  `);
});

// Terms of Service page
router.get('/terms', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Terms of Service - Honest UGC</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.6;
            color: #333;
          }
          h1, h2 { color: #202223; }
          a { color: #008060; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>Terms of Service</h1>
        <p>Last updated: ${new Date().toLocaleDateString()}</p>
        
        <h2>Acceptance of Terms</h2>
        <p>By using Honest UGC, you agree to these terms of service.</p>
        
        <h2>Description of Service</h2>
        <p>Honest UGC is a Shopify app that helps stores collect and manage user-generated content with automated rewards.</p>
        
        <h2>User Responsibilities</h2>
        <ul>
          <li>Provide accurate information</li>
          <li>Comply with all applicable laws</li>
          <li>Respect intellectual property rights</li>
          <li>Not use the service for deceptive or harmful purposes</li>
        </ul>
        
        <h2>Limitation of Liability</h2>
        <p>Honest UGC is provided "as is" without warranties. We are not liable for any damages arising from use of our service.</p>
        
        <h2>Contact</h2>
        <p>For questions about these terms, contact us through your Shopify admin.</p>
        
        <p><a href="/">← Back to Home</a></p>
      </body>
    </html>
  `);
});

export const pageRoutes = router;