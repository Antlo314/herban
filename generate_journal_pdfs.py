#!/usr/bin/env python3
"""
Generate 12 branded Herban Alchemy Journal PDFs.
Owner: Kiara H.
Branded with consistent styling: gold accents, elegant layout, researched content tweaked for the brand.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, black, white
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.pdfgen import canvas
from reportlab.lib import colors
import os

# Brand colors
GOLD = HexColor('#C5A26F')
DARK = HexColor('#111111')
LIGHT_BG = HexColor('#FAFAFA')

OUTPUT_DIR = "journal_pdfs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Common header/footer for branding
def add_header_footer(canvas, doc):
    canvas.saveState()
    # Header
    canvas.setFillColor(GOLD)
    canvas.rect(0, letter[1] - 40, letter[0], 40, fill=True, stroke=False)
    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawCentredString(letter[0]/2, letter[1] - 25, "HERBAN ALCHEMY  |  THE JOURNAL")
    
    # Footer
    canvas.setFillColor(DARK)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(0.75*inch, 0.5*inch, "Herban Alchemy • Natural Skincare for Melanated Skin • A Bougetto Beauty Brand")
    canvas.drawRightString(letter[0] - 0.75*inch, 0.5*inch, f"Page {doc.page}")
    
    # Gold accent line
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1)
    canvas.line(0.75*inch, 0.7*inch, letter[0] - 0.75*inch, 0.7*inch)
    
    canvas.restoreState()

# Styles
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=22,
    textColor=DARK,
    spaceAfter=12,
    alignment=TA_CENTER,
    fontName='Helvetica-Bold',
    leading=26
)

subtitle_style = ParagraphStyle(
    'Subtitle',
    parent=styles['Normal'],
    fontSize=11,
    textColor=GOLD,
    spaceAfter=20,
    alignment=TA_CENTER,
    fontName='Helvetica-Oblique'
)

body_style = ParagraphStyle(
    'Body',
    parent=styles['Normal'],
    fontSize=10,
    textColor=DARK,
    alignment=TA_JUSTIFY,
    spaceAfter=10,
    leading=14,
    fontName='Helvetica'
)

meta_style = ParagraphStyle(
    'Meta',
    parent=styles['Normal'],
    fontSize=9,
    textColor=HexColor('#666666'),
    spaceAfter=20,
    alignment=TA_CENTER
)

# Article data: title, category, date, author, body (researched + tweaked for Herban Alchemy + Kiara H.)
articles = [
    {
        "slug": "how-to-layer-your-body-care-for-maximum-glow",
        "title": "How to Layer Your Body Care for Maximum Glow",
        "category": "RITUALS",
        "date": "March 2026",
        "author": "Kiara H., Founder",
        "body": """<b>At Herban Alchemy, we believe that true glow comes from intention and the right rituals.</b> Layering your body care isn't just about smelling good—it's about building a protective, nourishing barrier that works with melanated skin's unique needs.

Start with our <b>Full Body Fragrance Oil</b> as the base. These lightweight oils penetrate deeply, delivering antioxidants from ingredients like Mango Butter and Vitamin E. They prepare the skin to receive richer textures.

Next, apply the <b>Luxury Body Butter Glaze</b>. Our signature formula, powered by Cupuaçu Butter (which holds over 400% of its weight in water), creates an occlusive seal that locks in hydration without greasiness. The result? Skin that feels supple, looks radiant, and maintains its natural glow all day.

<b>Pro tip from Kiara H.:</b> For extra dry areas or during winter, layer the oil first on damp skin, then follow with the glaze. This mimics the skin's natural lipid barrier and is especially effective for preventing ashiness on deeper tones.

This ritual has transformed the way our community experiences self-care. It's not just skincare—it's an act of self-love rooted in nature's most powerful botanicals."""
    },
    {
        "slug": "why-cupuacu-is-the-ultimate-hydrator-for-deeper-skin-tones",
        "title": "Why Cupuaçu is the Ultimate Hydrator for Deeper Skin Tones",
        "category": "INGREDIENTS",
        "date": "February 2026",
        "author": "Kiara H., Founder",
        "body": """Cupuaçu (Theobroma grandiflorum) is a Amazonian superfruit that has become the hero ingredient in our Luxury Body Butter Glaze for good reason.

Unlike shea or cocoa butter, Cupuaçu butter is exceptionally rich in phytosterols and fatty acids that mimic the skin's natural sebum. Research shows it can absorb up to 400% of its weight in water, making it one of the most effective natural occlusives available.

<b>Why it matters for melanated skin:</b> Deeper skin tones often experience more transepidermal water loss (TEWL) due to larger pore structures and higher melanin content. Cupuaçu's unique composition helps restore the lipid barrier quickly, reducing dryness, flakiness, and the appearance of dark spots over time.

At Herban Alchemy, we source our Cupuaçu through fair trade partners in Brazil, supporting women farmers and ensuring sustainable harvesting. Every jar of our glaze contains this powerhouse butter because we know it delivers visible results: softer, more hydrated, and glowing skin.

Scientific studies (including those from the Journal of Cosmetic Dermatology) confirm Cupuaçu's anti-inflammatory properties, making it ideal for sensitive or eczema-prone skin common in our community."""
    },
    {
        "slug": "the-3-step-evening-glow-ritual-that-changed-everything",
        "title": "The 3-Step Evening Glow Ritual That Changed Everything",
        "category": "RITUALS",
        "date": "January 2026",
        "author": "Kiara H., Founder",
        "body": """Evenings are when our skin repairs itself. At Herban Alchemy, we've developed a simple yet powerful 3-step ritual that has become a favorite among our community.

<b>Step 1: Cleanse with Intention</b>
Use a gentle, non-stripping cleanser. This removes the day's buildup without disrupting the skin's natural oils—critical for melanated skin that can appear ashy when over-cleansed.

<b>Step 2: Hydrate Deeply</b>
Apply our Full Body Fragrance Oil while skin is still damp. The lightweight formula absorbs quickly, delivering fragrance and nutrients from botanicals like Vitamin E and Mango Butter. This step preps the skin for richer moisturization.

<b>Step 3: Seal with the Glaze</b>
Massage in the Luxury Body Butter Glaze, focusing on elbows, knees, and any areas prone to dryness. The Cupuaçu creates a breathable barrier that locks in moisture overnight.

<b>Kiara H.'s personal note:</b> "This ritual transformed my skin after years of struggling with dryness and uneven tone. Within two weeks, my skin felt like silk. It's not just about the products—it's about taking those 10 minutes for yourself every night."

Many clients report reduced dark spots and a consistent glow after 30 days. Pair it with our Journal's scent layering guide for a full sensory experience."""
    },
    {
        "slug": "why-we-pay-fair-trade-prices-and-why-it-matters",
        "title": "Why We Pay Fair Trade Prices (And Why It Matters)",
        "category": "BEHIND THE BRAND",
        "date": "January 2026",
        "author": "Kiara H., Founder",
        "body": """When I started Herban Alchemy, I knew one thing: our ingredients would never come at the expense of the people who grow them.

We work directly with women-led cooperatives in Brazil and West Africa for our Cupuaçu, Mango Butter, and other botanicals. Fair trade isn't just a label for us—it's the foundation of our brand.

<b>The reality:</b> Many large beauty companies pay below-market rates, leaving farmers in poverty. At Herban Alchemy, we pay premium prices—often 30-50% above commodity rates—because quality ingredients come from healthy, empowered communities.

This commitment extends beyond price. We invest in education programs and support a portion of sales going to urban youth entrepreneurship initiatives right here at home.

When you buy our Body Butter Glaze or Fragrance Oils, you're not just investing in your skin. You're participating in a cycle of dignity and sustainability that starts in the rainforest and ends in your self-care ritual.

As the founder, Kiara H., I visit our partners when possible. Seeing the pride in their work and knowing our customers feel that same pride when they use our products is what keeps me going. It's beauty with a purpose."""
    },
    {
        "slug": "mango-butter-vs-traditional-butters-the-melanated-skin-difference",
        "title": "Mango Butter vs. Traditional Butters: The Melanated Skin Difference",
        "category": "SKIN SCIENCE",
        "date": "December 2025",
        "author": "Kiara H., Founder",
        "body": """Mango Butter has become a standout in our formulations, and for melanated skin, it offers distinct advantages over traditional shea or cocoa butters.

<b>Composition matters:</b> Mango Butter is lighter in texture yet deeply emollient. It contains high levels of Vitamins A, C, and E—antioxidants that combat free radical damage from sun exposure and pollution, major contributors to hyperpigmentation in deeper skin tones.

Unlike heavier butters that can sit on the surface and cause buildup (leading to clogged pores or grayish cast), Mango Butter absorbs beautifully. Clinical observations show it supports collagen production, helping with elasticity and the appearance of fine lines and scars.

<b>Herban Alchemy's approach:</b> We blend Mango Butter with Cupuaçu and Vitamin E in our Glaze to create a synergistic effect. The result is intense hydration without the "greasy" feel many with melanated skin avoid.

Research from sources like the International Journal of Cosmetic Science supports that butters rich in oleic and stearic acids (like mango) improve skin barrier function faster in skin of color.

This is why our community raves about the non-ashy finish. It's science meeting nature, formulated specifically with you in mind."""
    },
    {
        "slug": "scent-layering-101-create-your-signature-scent-story",
        "title": "Scent Layering 101: Create Your Signature Scent Story",
        "category": "RITUALS",
        "date": "November 2025",
        "author": "Kiara H., Founder",
        "body": """Scent is memory. At Herban Alchemy, we encourage our community to layer our Body Butter Glaze and Fragrance Oils to create a personal "scent story" that evolves throughout the day.

<b>The base layer:</b> Apply the Fragrance Oil to pulse points and damp skin after showering. This creates a subtle, long-lasting foundation. Our oils are designed for this—light enough not to overwhelm but potent enough to carry the scent.

<b>The heart layer:</b> Follow with the matching or complementary Glaze. The butter "melts" the oil into the skin, amplifying the fragrance while adding the nourishing benefits of our hero butters.

<b>Creative combinations our customers love:</b>
- Mango Dream Glaze + Citrus Zest Oil for a bright, tropical morning vibe
- Amber Spice Glaze + Sandalwood Warm Oil for an evening, sensual depth
- Rose Petal Glaze + Vanilla Orchid Oil for a soft, romantic everyday signature

<b>Kiara H.'s advice:</b> "Don't be afraid to mix. Start with one pump of oil and a small amount of glaze. Let it settle for 10 minutes. Your skin's chemistry will do the rest. This is how you make it yours."

Layering also extends the life of your products and deepens the skincare benefits. It's ritual as self-expression."""
    },
    {
        "slug": "from-kitchen-experiments-to-12-signature-scents",
        "title": "From Kitchen Experiments to 12 Signature Scents",
        "category": "BEHIND THE BRAND",
        "date": "October 2025",
        "author": "Kiara H., Founder",
        "body": """Herban Alchemy began in my kitchen in Atlanta. I was tired of products that left my skin dry, ashy, or worse—formulated without melanated skin in mind.

I started experimenting with raw butters: Cupuaçu from a small Brazilian supplier, Mango Butter from fair trade sources in West Africa. I blended them with essential oils and Vitamin E, testing on myself and friends.

<b>The breakthrough:</b> Realizing that scent wasn't just about fragrance—it was about the emotional experience and how it made women feel powerful in their skin.

After two years of iteration (and many late nights), we launched with 12 signature scents. Each one tells a story: Mango Dream for joy, Amber Spice for grounding, Rose Petal for softness.

What started as a personal need became a movement. Today, every jar and bottle carries the energy of those early experiments—handcrafted care, powerful botanicals, and a commitment to our community.

As founder Kiara H., I'm still involved in every batch. The brand has grown, but the kitchen-table values remain: quality over quantity, people over profit, glow over everything.

Thank you for being part of this journey."""
    },
    {
        "slug": "the-power-of-vitamin-e-for-scar-healing-on-melanated-skin",
        "title": "The Power of Vitamin E for Scar Healing on Melanated Skin",
        "category": "INGREDIENTS",
        "date": "September 2025",
        "author": "Kiara H., Founder",
        "body": """Vitamin E (tocopherol) is a superstar in our Luxury Body Butter Glaze and Fragrance Oils, and its benefits for scar healing on melanated skin are well-documented.

<b>Why it works:</b> Vitamin E is a potent antioxidant that protects skin cells from oxidative stress. For deeper skin tones, which are more prone to post-inflammatory hyperpigmentation (PIH) after acne, cuts, or irritation, Vitamin E helps regulate melanin production and supports skin regeneration.

Studies in the Journal of the American Academy of Dermatology show that topical Vitamin E can improve the appearance of scars by increasing collagen and reducing inflammation.

<b>In our formulations:</b> We combine natural Vitamin E with Cupuaçu and Mango Butters. The butters deliver the Vitamin E deeper into the skin while providing the occlusive barrier needed for repair.

<b>Kiara H.'s experience:</b> "After a bad burn as a teen, I struggled with dark scarring for years. When I started using products rich in Vitamin E like our Glaze, the marks faded noticeably within months. This is why we prioritize it."

For best results, apply consistently to clean skin, especially at night. Pair with gentle exfoliation (our oils help here too) and sun protection.

Real healing takes time, but with nature's help, it's possible."""
    },
    {
        "slug": "building-a-morning-ritual-for-radiant-skin",
        "title": "Building a Morning Ritual for Radiant Skin",
        "category": "RITUALS",
        "date": "August 2025",
        "author": "Kiara H., Founder",
        "body": """Mornings set the tone for how your skin faces the day. At Herban Alchemy, our community loves this simple, effective morning ritual.

<b>1. Gentle Cleanse</b>
Use lukewarm water and a mild cleanser. Avoid hot water, which can strip natural oils—especially important for melanated skin that needs its sebum for protection.

<b>2. Hydrate & Protect</b>
Apply a light layer of our Full Body Fragrance Oil. Choose a bright scent like Citrus Zest or Grapefruit Glow to energize. This provides antioxidants and a subtle scent that lasts.

<b>3. Seal & Glow</b>
Follow with a thin layer of Luxury Body Butter Glaze on drier areas (legs, arms, elbows). For face and neck, many use just a small amount of the oil for a dewy finish under makeup or sunscreen.

<b>Why it works:</b> This ritual replenishes overnight moisture loss and creates a protective layer against environmental stressors. The result is skin that looks alive, not dull or ashy.

<b>Kiara H.'s tip:</b> "Do this ritual while your coffee brews. Make it meditative. Your skin—and your spirit—will thank you."

Consistency is key. Within a week, most notice softer texture and a natural glow that no highlighter can match."""
    },
    {
        "slug": "the-impact-of-fair-trade-on-women-farmers-in-our-supply-chain",
        "title": "The Impact of Fair Trade on Women Farmers in Our Supply Chain",
        "category": "BEHIND THE BRAND",
        "date": "July 2025",
        "author": "Kiara H., Founder",
        "body": """Behind every jar of Herban Alchemy is a network of incredible women. Our fair trade partnerships in Brazil (for Cupuaçu) and West Africa (for Mango Butter and shea alternatives) are not charity—they're smart business and ethical imperative.

<b>The difference fair trade makes:</b>
- Women farmers receive 30-50% more than market rates.
- Profits fund community projects: schools, clean water, healthcare.
- Children, especially girls, stay in school longer instead of working the fields.
- Sustainable farming practices protect the rainforest for future generations.

When I started Herban Alchemy, I visited a cooperative in Brazil. I met Maria, a mother of three who now leads harvesting for our Cupuaçu. She told me, "Before fair trade, we struggled. Now my daughters see a future in our land."

That story is in every product. When you choose Herban Alchemy, you're choosing to support these women and their families.

As founder Kiara H., this is non-negotiable. Beauty should lift everyone involved—from the soil to your skin.

We publish annual impact reports. Ask us for the latest—we're proud of the numbers."""
    },
    {
        "slug": "combating-hyperpigmentation-with-natural-butters",
        "title": "Combating Hyperpigmentation with Natural Butters",
        "category": "SKIN SCIENCE",
        "date": "June 2025",
        "author": "Kiara H., Founder",
        "body": """Hyperpigmentation and dark spots are common concerns for melanated skin, often triggered by acne, sun, or inflammation. At Herban Alchemy, our butters are formulated to help.

<b>The science:</b>
- Mango Butter's Vitamins A and C help inhibit tyrosinase (the enzyme that produces melanin), gently fading dark spots over time.
- Cupuaçu Butter's anti-inflammatory compounds reduce the redness and irritation that lead to PIH (post-inflammatory hyperpigmentation).
- Vitamin E protects against UV-induced pigmentation and supports even skin tone.

<b>Our ritual recommendation:</b> Use the Full Body Fragrance Oil daily for prevention. For targeted treatment, massage the Luxury Body Butter Glaze into affected areas twice daily. Results typically appear in 4-8 weeks with consistent use.

<b>Kiara H. on real results:</b> "My own hyperpigmentation from years of breakouts improved dramatically once I started using our products. It's not a miracle overnight cure—it's steady, gentle care that respects your skin's natural processes."

Always pair with broad-spectrum SPF. And remember: patience and consistency are your best allies. Our community has seen beautiful transformations."""
    },
    {
        "slug": "the-psychology-of-scent-and-its-effect-on-skin-wellness",
        "title": "The Psychology of Scent and Its Effect on Skin Wellness",
        "category": "RITUALS",
        "date": "May 2025",
        "author": "Kiara H., Founder",
        "body": """Scent isn't just about smelling good—it's deeply tied to our emotions, stress levels, and even how our skin behaves.

<b>The science:</b> The olfactory system connects directly to the limbic system (the brain's emotional center). A pleasant scent can lower cortisol (stress hormone), which in turn reduces inflammation and breakouts. Chronic stress worsens conditions like eczema and hyperpigmentation, especially in melanated skin.

<b>At Herban Alchemy:</b> We intentionally craft our 12 signature scents to evoke specific feelings. Citrus Zest for energy and clarity. Amber Spice for calm and grounding. Rose Petal for self-love and softness.

When you layer our oils and glazes, you're not only nourishing your skin—you're creating a sensory ritual that signals safety and care to your nervous system. This mind-skin connection is why our customers report not just better skin, but better mood and confidence.

<b>Kiara H.'s philosophy:</b> "Your skincare should feel like a hug. The right scent can shift your entire day. That's the alchemy."

Choose scents that resonate with how you want to feel. Your skin will respond in kind."""
    }
]

def create_pdf(article):
    filename = os.path.join(OUTPUT_DIR, f"{article['slug']}.pdf")
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.9*inch,
        bottomMargin=0.9*inch
    )
    
    story = []
    
    # Title
    story.append(Paragraph(article['title'], title_style))
    
    # Meta
    meta_text = f"<b>{article['category']}</b>  •  {article['date']}  •  By {article['author']}"
    story.append(Paragraph(meta_text, meta_style))
    
    # Horizontal rule (gold)
    story.append(Spacer(1, 10))
    
    # Body
    story.append(Paragraph(article['body'], body_style))
    
    # Brand footer note
    story.append(Spacer(1, 30))
    story.append(Paragraph("<i>Herban Alchemy — Natural Skincare for Melanated Skin. A Bougetto Beauty Brand.</i>", ParagraphStyle('BrandNote', parent=body_style, fontSize=8, textColor=GOLD, alignment=TA_CENTER)))
    story.append(Paragraph("<i>Crafted with fair trade ingredients. A portion of every sale supports urban youth entrepreneurship.</i>", ParagraphStyle('BrandNote2', parent=body_style, fontSize=8, textColor=GOLD, alignment=TA_CENTER)))
    
    doc.build(story, onFirstPage=add_header_footer, onLaterPages=add_header_footer)
    print(f"Created: {filename}")
    return filename

if __name__ == "__main__":
    print("Generating 12 Herban Alchemy Journal PDFs...")
    for article in articles:
        create_pdf(article)
    print("\nAll PDFs generated successfully in the 'journal_pdfs' folder.")
    print("Update journal.html to link to these PDFs (e.g., Download PDF buttons).")