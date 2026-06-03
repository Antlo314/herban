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

    function resolveCartImage(type, scent, name = '', imageOverride = '') {
        if (type === 'raw') {
            if (name && rawCartImages[name]) return rawCartImages[name];
            return name.includes('Mango')
                ? 'assets/raw-mango-butter-photo-enhanced.jpg'
                : 'assets/raw-white-shea-photo-enhanced.jpg';
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
        resolveCartImage,
        getCartImage,
    };
})();