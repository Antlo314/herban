/** Shared scent → image maps for cart display across all pages */
(function () {
    const butterImages = {
        'Mango Dream': 'assets/mango_dream_butter.jpg',
        'Vanilla Orchid': 'assets/vanilla_orchid_butter.jpg',
        'Citrus Zest': 'assets/citrus_zest_butter.jpg',
        'Lavender Haze': 'assets/lavender_haze_butter.jpg',
        'Amber Spice': 'assets/amber_spice_butter.jpg',
        'Rose Petal': 'assets/rose_petal_butter.jpg',
        'Coconut Kiss': 'assets/coconut_kiss_butter.jpg',
        'Eucalyptus Fresh': 'assets/eucalyptus_fresh_butter.jpg',
        'Jasmine Nights': 'assets/jasmine_nights_butter.jpg',
        'Sandalwood Warm': 'assets/sandalwood_warm_butter.jpg',
        'Grapefruit Glow': 'assets/grapefruit_glow_butter.jpg',
        'Patchouli Earth': 'assets/patchouli_earth_butter.jpg',
        'Sweet Auburn': 'assets/atlanta-collection/sweet-auburn-photo-enhanced.jpg',
        'Peachtree': 'assets/atlanta-collection/peachtree-photo-enhanced.jpg',
        'Lenox': 'assets/atlanta-collection/lenox-photo-enhanced.jpg',
    };

    const oilImages = {
        'Mango Dream': 'assets/mango_dream_oil.jpg',
        'Vanilla Orchid': 'assets/vanilla_orchid_oil.jpg',
        'Citrus Zest': 'assets/citrus_zest_oil.jpg',
        'Amber Spice': 'assets/amber_spice_oil.jpg',
        'Rose Petal': 'assets/rose_petal_oil.jpg',
        'Coconut Kiss': 'assets/coconut_kiss_oil.jpg',
        'Sandalwood Warm': 'assets/sandalwood_warm_oil.jpg',
        'Grapefruit Glow': 'assets/grapefruit_glow_oil.jpg',
        'Ylang Ylang': 'assets/ylang_ylang_oil.jpg',
        'Tonka Bean': 'assets/tonka_bean_oil.jpg',
        'Fig Leaf': 'assets/fig_leaf_oil.jpg',
        'Oud & Saffron': 'assets/oud_saffron_oil.jpg',
        'Blue Lotus': 'assets/blue_lotus_oil.jpg',
        'White Tea': 'assets/white_tea_oil.jpg',
        'Lavender Haze': 'assets/lavender_haze_oil.jpg',
    };

    const rawCartImages = {
        'Raw White Shea Butter': 'assets/raw-white-shea-photo-enhanced.jpg',
        'Raw Mango Butter': 'assets/raw-mango-butter-photo-enhanced.jpg',
    };

    const menGlazeImages = {
        'Mango Dream': 'assets/men_glaze_mango_dream.jpg',
        'Vanilla Orchid': 'assets/men_glaze_vanilla_orchid.jpg',
        'Citrus Zest': 'assets/men_glaze_citrus_zest.jpg',
        'Lavender Haze': 'assets/men_glaze_lavender_haze.jpg',
        'Amber Spice': 'assets/men_glaze_amber_spice.jpg',
        'Rose Petal': 'assets/men_glaze_rose_petal.jpg',
        'Coconut Kiss': 'assets/men_glaze_coconut_kiss.jpg',
        'Eucalyptus Fresh': 'assets/men_glaze_eucalyptus_fresh.jpg',
        'Jasmine Nights': 'assets/men_glaze_jasmine_nights.jpg',
        'Sandalwood Warm': 'assets/men_glaze_sandalwood_warm.jpg',
        'Grapefruit Glow': 'assets/men_glaze_grapefruit_glow.jpg',
        'Patchouli Earth': 'assets/men_glaze_patchouli_earth.jpg',
    };

    const menCleanserImages = {
        'Mango Dream': 'assets/men_cleanser_mango_dream.jpg',
        'Vanilla Orchid': 'assets/men_cleanser_vanilla_orchid.jpg',
        'Citrus Zest': 'assets/men_cleanser_citrus_zest.jpg',
        'Lavender Haze': 'assets/men_cleanser_lavender_haze.jpg',
        'Amber Spice': 'assets/men_cleanser_amber_spice.jpg',
        'Rose Petal': 'assets/men_cleanser_rose_petal.jpg',
        'Coconut Kiss': 'assets/men_cleanser_coconut_kiss.jpg',
        'Eucalyptus Fresh': 'assets/men_cleanser_eucalyptus_fresh.jpg',
        'Jasmine Nights': 'assets/men_cleanser_jasmine_nights.jpg',
        'Sandalwood Warm': 'assets/men_cleanser_sandalwood_warm.jpg',
        'Grapefruit Glow': 'assets/men_cleanser_grapefruit_glow.jpg',
        'Patchouli Earth': 'assets/men_cleanser_patchouli_earth.jpg',
    };

    function resolveCartImage(type, scent, name = '', imageOverride = '') {
        if (type === 'men_cleanser' || (name && (name.includes("Men's Face Cleanser") || name.includes("Men's Cleanser"))) || (scent && (scent.includes("Men's Face Cleanser") || scent.includes("Men's Cleanser")))) {
            if (scent && menCleanserImages[scent]) return menCleanserImages[scent];
            return 'assets/men_face_cleanser.jfif';
        }
        if (type === 'men_glaze' || (name && (name.includes("Men's Body Glaze") || name.includes("Men's Glaze"))) || (scent && (scent.includes("Men's Body Glaze") || scent.includes("Men's Glaze")))) {
            if (scent && menGlazeImages[scent]) return menGlazeImages[scent];
            return 'assets/men_body_glaze.jfif';
        }
        if (type === 'raw') {
            if (name && rawCartImages[name]) return rawCartImages[name];
            return name.includes('Mango')
                ? 'assets/raw-mango-butter-photo-enhanced.jpg'
                : 'assets/raw-white-shea-photo-enhanced.jpg';
        }
        if (type === 'carrier_oil') {
            return 'assets/carrier_oil_base.png';
        }
        if (imageOverride && type !== 'butter' && type !== 'oil') return imageOverride;
        if (type === 'butter' && scent && butterImages[scent]) return butterImages[scent];
        if (type === 'oil' && scent && oilImages[scent]) return oilImages[scent];
        if (type === 'butter') return 'assets/amber_spice_butter.jpg';
        if (type === 'oil') return 'assets/mango_dream_oil.jpg';
        return 'assets/herban.jpg';
    }

    function getCartImage(item) {
        if (!item) return 'assets/herban.jpg';
        return resolveCartImage(item.type, item.scent, item.name || '');
    }

    window.HERBAN_CART_IMAGES = {
        butterImages,
        oilImages,
        rawCartImages,
        menGlazeImages,
        menCleanserImages,
        resolveCartImage,
        getCartImage,
    };
})();