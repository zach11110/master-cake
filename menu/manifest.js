// JS fallback for environments where fetch of JSON via file:// is blocked.
// This mirrors the structure of manifest.json and exposes window.MENU_MANIFEST.
window.MENU_MANIFEST = {
  brand: {
    arName: 'بوظة مستر كيك',
    enName: 'Master Cake',
    tagAr: 'قائمة راقية بطابع حديث',
    tagEn: 'A modern, premium menu experience'
  },
  sections: {
    cold_drinks: {
      ar: 'مشروبات باردة',
      en: 'Cold Drinks',
      items: [
        { id: 'iced-latte', arName: 'ايسد لاتيه', enName: 'Iced Latte', descriptionAr: 'حليب بارد مع اسبريسو ومكعبات ثلج.', descriptionEn: 'Cold milk with espresso and ice cubes.', images: ['iced-latte-1.jpg', 'iced-latte-2.jpg'] },
        { id: 'iced-americano', arName: 'ايسد امريكانو', enName: 'Iced Americano', descriptionAr: 'اسبريسو مع ماء بارد وثلج.', descriptionEn: 'Espresso over cold water and ice.', images: ['iced-americano-1.jpg', 'iced-americano-2.jpg'] },
        { id: 'iced-mocha', arName: 'ايسد موكا', enName: 'Iced Mocha', descriptionAr: 'شوكولا، اسبريسو، حليب بارد.', descriptionEn: 'Chocolate, espresso, cold milk.', images: ['iced-mocha-1.jpg'] },
        { id: 'frappuccino-caramel', arName: 'فرابتشينو كراميل', enName: 'Caramel Frappuccino', descriptionAr: 'مشروب مثلّج بنكهة الكراميل.', descriptionEn: 'Blended iced drink with caramel.', images: ['frappuccino-caramel-1.jpg'] },
        { id: 'lemonade-fresh', arName: 'ليموناضة طازجة', enName: 'Fresh Lemonade', descriptionAr: 'عصير ليمون طبيعي منعش.', descriptionEn: 'Refreshing fresh lemon juice.', images: [] },
        { id: 'mojito-classic', arName: 'موهيتو كلاسيك', enName: 'Classic Mojito', descriptionAr: 'نعناع، ليمون، صودا.', descriptionEn: 'Mint, lime, soda.', images: [] },
        { id: 'strawberry-smoothie', arName: 'سموذي فراولة', enName: 'Strawberry Smoothie', descriptionAr: 'فراولة طازجة وحليب/زبادي.', descriptionEn: 'Fresh strawberries with milk/yogurt.', images: [] },
        { id: 'mango-smoothie', arName: 'سموذي مانجو', enName: 'Mango Smoothie', descriptionAr: 'مانجو ناضجة وقوام كريمي.', descriptionEn: 'Ripe mango with creamy texture.', images: [] },
        { id: 'cold-brew', arName: 'كولد برو', enName: 'Cold Brew', descriptionAr: 'قهوة منقوعة على البارد لساعات.', descriptionEn: 'Slow-steeped cold coffee.', images: [] },
        { id: 'chocolate-milkshake', arName: 'ميلكشيك شوكولا', enName: 'Chocolate Milkshake', descriptionAr: 'آيس كريم شوكولا مع حليب.', descriptionEn: 'Chocolate ice cream blended with milk.', images: [] }
      ]
    },
    hot_drinks: {
      ar: 'مشروبات ساخنة',
      en: 'Hot Drinks',
      items: [
        { id: 'cappuccino', arName: 'كابتشينو', enName: 'Cappuccino', descriptionAr: 'اسبريسو مع حليب مبخر ورغوة.', descriptionEn: 'Espresso with steamed milk and foam.', images: [] },
        { id: 'latte', arName: 'لاتيه', enName: 'Latte', descriptionAr: 'اسبريسو مع كمية أكبر من الحليب.', descriptionEn: 'Espresso with a larger portion of milk.', images: [] },
        { id: 'americano', arName: 'امريكانو', enName: 'Americano', descriptionAr: 'اسبريسو مع ماء ساخن.', descriptionEn: 'Espresso with hot water.', images: [] },
        { id: 'espresso', arName: 'اسبريسو', enName: 'Espresso', descriptionAr: 'قهوة مركزة بنكهة قوية.', descriptionEn: 'Rich, concentrated coffee shot.', images: [] },
        { id: 'double-espresso', arName: 'دبل اسبريسو', enName: 'Double Espresso', descriptionAr: 'جرعتان من الاسبريسو.', descriptionEn: 'Two shots of espresso.', images: [] },
        { id: 'flat-white', arName: 'فلات وايت', enName: 'Flat White', descriptionAr: 'اسبريسو مع مايكروفوم ناعم.', descriptionEn: 'Espresso with silky microfoam.', images: [] },
        { id: 'mocha', arName: 'موكا ساخن', enName: 'Hot Mocha', descriptionAr: 'شوكولا ساخنة مع اسبريسو وحليب.', descriptionEn: 'Hot chocolate with espresso and milk.', images: [] },
        { id: 'hot-chocolate', arName: 'شوكولا ساخنة', enName: 'Hot Chocolate', descriptionAr: 'شوكولا كريمية دافئة.', descriptionEn: 'Warm, creamy chocolate.', images: [] },
        { id: 'tea-mint', arName: 'شاي بالنعناع', enName: 'Mint Tea', descriptionAr: 'شاي عطري مع أوراق نعناع.', descriptionEn: 'Aromatic tea with mint leaves.', images: [] },
        { id: 'turkish-coffee', arName: 'قهوة تركية', enName: 'Turkish Coffee', descriptionAr: 'قهوة مطحونة ناعمة على الطريقة التركية.', descriptionEn: 'Finely ground coffee brewed Turkish style.', images: [] }
      ]
    },
    sweets: {
      ar: 'حلويات',
      en: 'Sweets',
      items: [
        { id: 'cheesecake', arName: 'تشيزكيك', enName: 'Cheesecake', descriptionAr: 'طبقة بسكويت زبدية وكريمة جبن.', descriptionEn: 'Buttery biscuit crust with cream cheese.', images: [] },
        { id: 'tiramisu', arName: 'تيراميسو', enName: 'Tiramisu', descriptionAr: 'بسكويت ساڤوياردي وقهوة وماسكاربونه.', descriptionEn: 'Savoiardi with coffee and mascarpone.', images: [] },
        { id: 'brownie', arName: 'براوني شوكولا', enName: 'Chocolate Brownie', descriptionAr: 'كيك شوكولا كثيف وفدج.', descriptionEn: 'Fudgy, dense chocolate cake.', images: [] },
        { id: 'croissant', arName: 'كرواسون زبدة', enName: 'Butter Croissant', descriptionAr: 'طبقات مورّقة وزبدة عطرية.', descriptionEn: 'Flaky layers with aromatic butter.', images: [] },
        { id: 'baklava', arName: 'بقلاوة', enName: 'Baklava', descriptionAr: 'رقائق عجين محلاة بالمكسرات والعسل.', descriptionEn: 'Phyllo layers with nuts and honey.', images: [] },
        { id: 'kunafa', arName: 'كنافة', enName: 'Kunafa', descriptionAr: 'شعيرية كنافة مع جبنة أو قشطة.', descriptionEn: 'Shredded pastry with cheese or cream.', images: [] },
        { id: 'pistachio-cake', arName: 'كيك فستق', enName: 'Pistachio Cake', descriptionAr: 'كيك فستق طري مع كريمة خفيفة.', descriptionEn: 'Soft pistachio cake with light cream.', images: [] },
        { id: 'chocolate-cake', arName: 'كيك الشوكولا', enName: 'Chocolate Cake', descriptionAr: 'كيك شوكولا غني بطبقات كريمة.', descriptionEn: 'Rich chocolate cake with layers of cream.', images: [] },
        { id: 'fruit-salad', arName: 'سلطة فواكه', enName: 'Fruit Salad', descriptionAr: 'توليفة فواكه موسمية طازجة.', descriptionEn: 'Mix of fresh seasonal fruits.', images: [] },
        { id: 'waffles', arName: 'وافل', enName: 'Waffles', descriptionAr: 'وافل هش topping حسب الرغبة.', descriptionEn: 'Crisp waffles with your choice of toppings.', images: [] }
      ]
    },
    argillies: {
      ar: 'أركيلة',
      en: 'Argillies (Hookah)',
      items: [
        { id: 'mint-mix', arName: 'نعناع ميكس', enName: 'Mint Mix', descriptionAr: 'نكهات نعناع منعشة.', descriptionEn: 'Refreshing mint blends.', images: [] },
        { id: 'double-apple', arName: 'تفاحتين', enName: 'Double Apple', descriptionAr: 'نكهة تفاح أحمر وأخضر.', descriptionEn: 'Red and green apple blend.', images: [] },
        { id: 'grape-mint', arName: 'عنب نعناع', enName: 'Grape Mint', descriptionAr: 'عنب حلو مع لمسة نعناع.', descriptionEn: 'Sweet grape with mint touch.', images: [] },
        { id: 'lemon-mint', arName: 'ليمون نعناع', enName: 'Lemon Mint', descriptionAr: 'حمضيات منعشة مع نعناع.', descriptionEn: 'Zesty lemon with mint.', images: [] },
        { id: 'watermelon', arName: 'بطيخ', enName: 'Watermelon', descriptionAr: 'بطيخ حلو وخفيف.', descriptionEn: 'Light, sweet watermelon.', images: [] },
        { id: 'blueberry', arName: 'توت أزرق', enName: 'Blueberry', descriptionAr: 'توت عطري بطعم حلو.', descriptionEn: 'Aromatic sweet blueberry.', images: [] },
        { id: 'peach', arName: 'خوخ', enName: 'Peach', descriptionAr: 'خوخ ناضج بطعم سكري.', descriptionEn: 'Ripe, sugary peach.', images: [] },
        { id: 'gum-mint', arName: 'علكة نعناع', enName: 'Gum Mint', descriptionAr: 'علكة منعشة مع نعناع.', descriptionEn: 'Refreshing gum with mint.', images: [] },
        { id: 'cocktail-special', arName: 'كوكتيل سبيشل', enName: 'Cocktail Special', descriptionAr: 'خلطة خاصة من نكهات مختارة.', descriptionEn: 'Special blend of selected flavors.', images: [] },
        { id: 'cappuccino-flavor', arName: 'كابتشينو', enName: 'Cappuccino Flavor', descriptionAr: 'لمسة قهوة كريمية.', descriptionEn: 'Creamy coffee-inspired flavor.', images: [] }
      ]
    },
    ice_cream: {
      ar: 'بوظة / آيس كريم',
      en: 'Ice Cream',
      items: [
        { id: 'pistachio', arName: 'فستق حلبي', enName: 'Pistachio', descriptionAr: 'بوظة فستق كريمية.', descriptionEn: 'Creamy pistachio ice cream.', images: [] },
        { id: 'chocolate', arName: 'شوكولا', enName: 'Chocolate', descriptionAr: 'شوكولا غنية.', descriptionEn: 'Rich chocolate.', images: [] },
        { id: 'vanilla', arName: 'فانيلا', enName: 'Vanilla', descriptionAr: 'فانيلا طبيعية.', descriptionEn: 'Natural vanilla.', images: [] },
        { id: 'strawberry', arName: 'فراولة', enName: 'Strawberry', descriptionAr: 'فراولة طازجة.', descriptionEn: 'Fresh strawberry.', images: [] },
        { id: 'mango', arName: 'مانجو', enName: 'Mango', descriptionAr: 'مانجو ناضج.', descriptionEn: 'Ripe mango.', images: [] },
        { id: 'lemon-sorbet', arName: 'ليمون سوربيه', enName: 'Lemon Sorbet', descriptionAr: 'سوربيه ليمون منعش.', descriptionEn: 'Refreshing lemon sorbet.', images: [] },
        { id: 'caramel', arName: 'كراميل', enName: 'Caramel', descriptionAr: 'كراميل ناعم.', descriptionEn: 'Smooth caramel.', images: [] },
        { id: 'cookies-cream', arName: 'كوكيز آند كريم', enName: 'Cookies & Cream', descriptionAr: 'قطع بسكويت مع كريمة.', descriptionEn: 'Cookie chunks with cream.', images: [] },
        { id: 'hazelnut', arName: 'بندق', enName: 'Hazelnut', descriptionAr: 'نكهة بندق عطرية.', descriptionEn: 'Aromatic hazelnut flavor.', images: [] },
        { id: 'coffee', arName: 'قهوة', enName: 'Coffee', descriptionAr: 'نكهة قهوة متوازنة.', descriptionEn: 'Balanced coffee flavor.', images: [] }
      ]
    }
  }
};

