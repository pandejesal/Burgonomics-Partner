import { db } from '@/config/firebase';
import {
  collection,
  doc,
  writeBatch,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import type { MenuCategory, MenuItem } from '@/types';

export const BURGONOMICS_DEFAULT_CATEGORIES: MenuCategory[] = [
  { id: 'cat_classic_burgers', name: 'Classic Burgers', sortOrder: 1, active: true },
  { id: 'cat_big_bang_burgers', name: 'Big Bang Burgers (5")', sortOrder: 2, active: true },
  { id: 'cat_sizzling_burgers', name: 'Sizzling Burgers', sortOrder: 3, active: true },
  { id: 'cat_fries', name: 'French Fries', sortOrder: 4, active: true },
  { id: 'cat_pizza', name: 'Pizza (8")', sortOrder: 5, active: true },
  { id: 'cat_pasta', name: 'Pasta', sortOrder: 6, active: true },
  { id: 'cat_garlic_bread', name: 'Garlic Bread', sortOrder: 7, active: true },
  { id: 'cat_momos', name: 'Momos', sortOrder: 8, active: true },
  { id: 'cat_coolers', name: 'Coolers', sortOrder: 9, active: true },
  { id: 'cat_shakes', name: 'Thick Shakes', sortOrder: 10, active: true },
  { id: 'cat_beverages', name: 'Coffee & Hot Drinks', sortOrder: 11, active: true },
  { id: 'cat_desserts', name: 'Desserts', sortOrder: 12, active: true },
  { id: 'cat_combos', name: 'Combo & Meals', sortOrder: 13, active: true },
];

export const BURGONOMICS_63_ITEMS: Omit<MenuItem, 'lastSyncedAt'>[] = [
  // --- Category 1: Classic Burgers ---
  {
    id: 'prd_jr_hero',
    petpoojaItemId: 'PP-BRG-101',
    name: 'Jr. Hero Burger',
    description: 'A small bite, big on taste with signature seasoning and crunchy patty.',
    price: 49,
    categoryId: 'cat_classic_burgers',
    image: '/images/menu/classic-burgers/jr-hero-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_red_hot',
    petpoojaItemId: 'PP-BRG-102',
    name: 'Red Hot Spicy Burger',
    description: 'A fiery kick in every bite with spicy jalapeno relish & chili mayo.',
    price: 79,
    categoryId: 'cat_classic_burgers',
    image: '/images/menu/classic-burgers/red-hot-spicy-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_hero',
    petpoojaItemId: 'PP-BRG-103',
    name: 'Hero Burger',
    description: 'The classic flagship hero that never disappoints. Pure veggie perfection.',
    price: 99,
    categoryId: 'cat_classic_burgers',
    image: '/images/menu/classic-burgers/hero-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_mexican_mafia',
    petpoojaItemId: 'PP-BRG-104',
    name: 'Mexican Mafia Burger',
    description: 'Zesty mild salsa, crunchy nachos, and totally gangster Mexican spices.',
    price: 99,
    categoryId: 'cat_classic_burgers',
    image: '/images/menu/classic-burgers/mexican-mafia-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_korean_kimchi',
    petpoojaItemId: 'PP-BRG-105',
    name: 'Korean Kimchi Burger',
    description: 'Bold fermented Korean flavors with a spicy gochujang chili twist.',
    price: 99,
    categoryId: 'cat_classic_burgers',
    image: '/images/menu/classic-burgers/korean-kimchi-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_veggie_loaded',
    petpoojaItemId: 'PP-BRG-106',
    name: 'Veggie Loaded Burger',
    description: 'Packed to the brim with fresh crunchy veggies and double herb spread.',
    price: 109,
    categoryId: 'cat_classic_burgers',
    image: '/images/menu/classic-burgers/veggie-loaded-burger.jpg',
    available: true,
    veg: true,
  },

  // --- Category 2: Big Bang Burgers (5") ---
  {
    id: 'prd_farm_fresh',
    petpoojaItemId: 'PP-BB-201',
    name: 'Farm Fresh Burger',
    description: 'Garden-fresh crispy patty with gourmet greens in a giant 5-inch toasted bun.',
    price: 149,
    categoryId: 'cat_big_bang_burgers',
    image: '/images/menu/big-bang-burgers/farm-fresh-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_great_indian',
    petpoojaItemId: 'PP-BB-202',
    name: 'Great Indian Burger',
    description: 'Aromatic desi spices meet rich creamy indulgence in a 5-inch bun.',
    price: 159,
    categoryId: 'cat_big_bang_burgers',
    image: '/images/menu/big-bang-burgers/great-indian-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_cheese_burst',
    petpoojaItemId: 'PP-BB-203',
    name: 'Cheese Burst Burger',
    description: 'Whole cheese-filled patty for the ultimate warm molten cheese pull.',
    price: 179,
    categoryId: 'cat_big_bang_burgers',
    image: '/images/menu/big-bang-burgers/cheese-burst-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_tandoori_paneer',
    petpoojaItemId: 'PP-BB-204',
    name: 'Tandoori Paneer Burger',
    description: 'Double layered tandoori-spiced char-grilled paneer patty burger.',
    price: 189,
    categoryId: 'cat_big_bang_burgers',
    image: '/images/menu/big-bang-burgers/tandoori-paneer-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_super_hero',
    petpoojaItemId: 'PP-BB-205',
    name: 'Super Hero Burger',
    description: 'Double patty experience featuring Veggie Aloo + molten Cheese core.',
    price: 199,
    categoryId: 'cat_big_bang_burgers',
    image: '/images/menu/big-bang-burgers/super-hero-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_burning_man',
    petpoojaItemId: 'PP-BB-206',
    name: 'The Burning Man Burger',
    description: 'Hot, fiery ghost pepper sauce and jalapenos for true spice lovers.',
    price: 199,
    categoryId: 'cat_big_bang_burgers',
    image: '/images/menu/big-bang-burgers/burning-man-burger.jpg',
    available: true,
    veg: true,
  },

  // --- Category 3: Sizzling Burgers ---
  {
    id: 'prd_veg_sizzling',
    petpoojaItemId: 'PP-SIZ-301',
    name: 'Veg Sizzling Burger',
    description: 'Sizzles with every crunchy bite, served piping hot on a cast-iron skillet.',
    price: 249,
    categoryId: 'cat_sizzling_burgers',
    image: '/images/menu/sizzling-burgers/veg-sizzling-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_cheese_supreme',
    petpoojaItemId: 'PP-SIZ-302',
    name: 'Cheese Supreme Burger',
    description: 'Extra cheese, extra wow. Hot molten cheese poured on a sizzling plate.',
    price: 349,
    categoryId: 'cat_sizzling_burgers',
    image: '/images/menu/sizzling-burgers/cheese-supreme-burger.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_paneer_supreme',
    petpoojaItemId: 'PP-SIZ-303',
    name: 'Paneer Supreme Burger',
    description: 'Paneer meets rich spices on a sizzling plate with bubbling makhani sauce.',
    price: 349,
    categoryId: 'cat_sizzling_burgers',
    image: '/images/menu/sizzling-burgers/paneer-supreme-burger.jpg',
    available: true,
    veg: true,
  },

  // --- Category 4: French Fries ---
  {
    id: 'prd_salted_fries',
    petpoojaItemId: 'PP-SD-401',
    name: 'Salted Fries',
    description: 'The classic golden crispy salted crunch.',
    price: 89,
    categoryId: 'cat_fries',
    image: '/images/menu/fries/salted-fries.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_peri_peri_fries',
    petpoojaItemId: 'PP-SD-402',
    name: 'Peri Peri Fries',
    description: 'Crispy skin-on fries dusted with our signature African peri peri spice.',
    price: 99,
    categoryId: 'cat_fries',
    image: '/images/menu/fries/peri-peri-fries.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_peri_peri_cheesy',
    petpoojaItemId: 'PP-SD-403',
    name: 'Peri Peri Cheesy Fries',
    description: 'Double fun with fiery peri peri seasoning and warm molten cheddar sauce.',
    price: 139,
    categoryId: 'cat_fries',
    image: '/images/menu/fries/peri-peri-cheesy-fries.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_dirty_fries',
    petpoojaItemId: 'PP-SD-404',
    name: 'Dirty Fries',
    description: 'Messy, loaded with sauces, diced jalapenos, and melted cheese pull.',
    price: 139,
    categoryId: 'cat_fries',
    image: '/images/menu/fries/dirty-fries.jpg',
    available: true,
    veg: true,
  },

  // --- Category 5: Pizza (8") ---
  {
    id: 'prd_classic_margherita',
    petpoojaItemId: 'PP-PZ-501',
    name: 'Classic Margherita Pizza',
    description: 'Timeless cheesy perfection with marinara sauce and fresh basil aroma.',
    price: 219,
    categoryId: 'cat_pizza',
    image: '/images/menu/pizza/classic-margherita-pizza.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_peri_peri_paneer_pizza',
    petpoojaItemId: 'PP-PZ-502',
    name: 'Peri Peri Paneer Pizza',
    description: 'Spiced cottage cheese paneer chunks with a fiery peri-peri punch.',
    price: 249,
    categoryId: 'cat_pizza',
    image: '/images/menu/pizza/peri-peri-paneer-pizza.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_veg_overload_pizza',
    petpoojaItemId: 'PP-PZ-503',
    name: 'The Veg Overload Pizza',
    description: 'A veggie feast of red onions, crisp capsicum, black olives, and sweet corn.',
    price: 249,
    categoryId: 'cat_pizza',
    image: '/images/menu/pizza/veg-overload-pizza.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_cheesy_heaven_pizza',
    petpoojaItemId: 'PP-PZ-504',
    name: 'Cheesy Heaven Pizza',
    description: 'Because too much cheese is never enough. Quad-cheese molten blend.',
    price: 249,
    categoryId: 'cat_pizza',
    image: '/images/menu/pizza/cheesy-heaven-pizza.jpg',
    available: true,
    veg: true,
  },

  // --- Category 6: Pasta ---
  {
    id: 'prd_alfredo_pasta',
    petpoojaItemId: 'PP-PST-601',
    name: 'Alfredo Cheese Sauce Pasta',
    description: 'Creamy, dreamy, and rich penne pasta tossed in garlic herb butter.',
    price: 179,
    categoryId: 'cat_pasta',
    image: '/images/menu/pasta/alfredo-cheese-sauce-pasta.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_arrabiata_pasta',
    petpoojaItemId: 'PP-PST-602',
    name: 'Arrabiata Pasta',
    description: 'Tangy, spicy, and full of zing Italian tomato sauce penne with chili flakes.',
    price: 189,
    categoryId: 'cat_pasta',
    image: '/images/menu/pasta/arrabiata-pasta.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_pink_sauce_pasta',
    petpoojaItemId: 'PP-PST-603',
    name: 'Pink Sauce Pasta',
    description: 'The perfect harmony of creamy alfredo & tangy arrabiata tomato sauce.',
    price: 189,
    categoryId: 'cat_pasta',
    image: '/images/menu/pasta/pink-sauce-pasta.jpg',
    available: true,
    veg: true,
  },

  // --- Category 7: Garlic Bread ---
  {
    id: 'prd_cheese_garlic_bread',
    petpoojaItemId: 'PP-GB-701',
    name: 'Cheese Garlic Bread',
    description: 'A toasted garlic baguette with rich melted bubbly mozzarella cheese.',
    price: 129,
    categoryId: 'cat_garlic_bread',
    image: '/images/menu/garlic-bread/cheese-garlic-bread.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_cheese_corn_garlic_bread',
    petpoojaItemId: 'PP-GB-702',
    name: 'Cheese Corn Garlic Bread',
    description: 'Sweet golden corn kernels meet melted gooey cheese and herb butter.',
    price: 139,
    categoryId: 'cat_garlic_bread',
    image: '/images/menu/garlic-bread/cheese-corn-garlic-bread.jpg',
    available: true,
    veg: true,
  },

  // --- Category 8: Momos ---
  {
    id: 'prd_veg_momos_steam',
    petpoojaItemId: 'PP-MO-801',
    name: 'Veg Momos (Steam)',
    description: 'Simple, soft, and soul-satisfying steamed vegetable dumplings.',
    price: 119,
    categoryId: 'cat_momos',
    image: '/images/menu/momos/veg-momos-steam.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_veg_momos_fried',
    petpoojaItemId: 'PP-MO-802',
    name: 'Veg Momos (Fried)',
    description: 'Golden, crispy fried vegetable dumplings with spicy red dip.',
    price: 129,
    categoryId: 'cat_momos',
    image: '/images/menu/momos/veg-momos-fried.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_spicy_paneer_momos_steam',
    petpoojaItemId: 'PP-MO-803',
    name: 'Spicy Paneer Momos (Steam)',
    description: 'Soft steamed dumplings stuffed with spiced cottage cheese filling.',
    price: 129,
    categoryId: 'cat_momos',
    image: '/images/menu/momos/spicy-paneer-momos-steam.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_spicy_paneer_momos_fried',
    petpoojaItemId: 'PP-MO-804',
    name: 'Spicy Paneer Momos (Fried)',
    description: 'Crunchy fried dumplings stuffed with spicy paneer herbs.',
    price: 139,
    categoryId: 'cat_momos',
    image: '/images/menu/momos/spicy-paneer-momos-fried.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_veg_cheese_momos_steam',
    petpoojaItemId: 'PP-MO-805',
    name: 'Veg Cheese Momos (Steam)',
    description: 'Melty cheese and vegetables wrapped in soft steamed dumpling dough.',
    price: 139,
    categoryId: 'cat_momos',
    image: '/images/menu/momos/veg-cheese-momos-steam.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_veg_cheese_momos_fried',
    petpoojaItemId: 'PP-MO-806',
    name: 'Veg Cheese Momos (Fried)',
    description: 'Super crispy golden dumplings overflowing with warm gooey cheese.',
    price: 149,
    categoryId: 'cat_momos',
    image: '/images/menu/momos/veg-cheese-momos-fried.jpg',
    available: true,
    veg: true,
  },

  // --- Category 9: Coolers ---
  {
    id: 'prd_masala_lemonade',
    petpoojaItemId: 'PP-CLR-901',
    name: 'Masala Lemonade',
    description: 'Zesty, refreshing freshly squeezed lemonade with roasted cumin spices.',
    price: 89,
    categoryId: 'cat_coolers',
    image: '/images/menu/coolers/masala-lemonade.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_kokum_drink',
    petpoojaItemId: 'PP-CLR-902',
    name: 'Kokum Drink',
    description: 'Traditional sweet, tangy and refreshing crimson kokum cooler with mint.',
    price: 89,
    categoryId: 'cat_coolers',
    image: '/images/menu/coolers/kokum-drink.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_masala_coke',
    petpoojaItemId: 'PP-CLR-903',
    name: 'Masala Coke',
    description: 'Chilled Coca-Cola with black salt, roasted cumin and lime fizz.',
    price: 89,
    categoryId: 'cat_coolers',
    image: '/images/menu/coolers/masala-coke.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_blueberry_rosemint_tea',
    petpoojaItemId: 'PP-CLR-904',
    name: 'Blueberry Rosemint Iced Tea',
    description: 'Floral rose petals and fresh blueberries infused in cold brewed tea.',
    price: 99,
    categoryId: 'cat_coolers',
    image: '/images/menu/coolers/blueberry-rosemint-tea.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_hibiscus_iced_tea',
    petpoojaItemId: 'PP-CLR-905',
    name: 'Hibiscus Iced Tea',
    description: 'Vibrant ruby-red tea brewed with citrus botanical notes and crushed ice.',
    price: 99,
    categoryId: 'cat_coolers',
    image: '/images/menu/coolers/hibiscus-iced-tea.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_peach_iced_tea',
    petpoojaItemId: 'PP-CLR-906',
    name: 'Peach Iced Tea',
    description: 'Sweet juicy peach nectar blended with refreshing iced black tea.',
    price: 99,
    categoryId: 'cat_coolers',
    image: '/images/menu/coolers/peach-iced-tea.jpg',
    available: true,
    veg: true,
  },

  // --- Category 10: Thick Shakes ---
  {
    id: 'prd_cold_coco',
    petpoojaItemId: 'PP-SHK-1001',
    name: 'Cold COCO',
    description: 'Rich, ultra-thick chocolate beverage served ice cold.',
    price: 139,
    categoryId: 'cat_shakes',
    image: '/images/menu/thick-shakes/cold-coco.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_alfanso_mango_shake',
    petpoojaItemId: 'PP-SHK-1002',
    name: 'Alfanso Mango Shake',
    description: 'Thick premium shake loaded with pure Ratnagiri Alphonso mango pulp.',
    price: 149,
    categoryId: 'cat_shakes',
    image: '/images/menu/thick-shakes/alfanso-mango-shake.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_cookies_cream_shake',
    petpoojaItemId: 'PP-SHK-1003',
    name: 'Cookies ND Cream',
    description: 'Crushed chocolate Oreo cookies blended with thick vanilla ice cream.',
    price: 159,
    categoryId: 'cat_shakes',
    image: '/images/menu/thick-shakes/cookies-cream-shake.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_brownie_shake',
    petpoojaItemId: 'PP-SHK-1004',
    name: 'Brownie Shake',
    description: 'Decadent chocolate shake blended with chunks of warm fudge brownie.',
    price: 179,
    categoryId: 'cat_shakes',
    image: '/images/menu/thick-shakes/brownie-shake.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_ferrero_rocher_shake',
    petpoojaItemId: 'PP-SHK-1005',
    name: 'Ferrero Rocher',
    description: 'Gourmet hazelnut shake blended with real Ferrero chocolates and Nutella.',
    price: 179,
    categoryId: 'cat_shakes',
    image: '/images/menu/thick-shakes/ferrero-rocher-shake.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_biscoff_shake',
    petpoojaItemId: 'PP-SHK-1006',
    name: 'Lotus Biscoff Shake',
    description: 'Caramelized Lotus Biscoff biscuit spread blended into creamy thick shake.',
    price: 189,
    categoryId: 'cat_shakes',
    image: '/images/menu/thick-shakes/biscoff-shake.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_tiramisu_cheesecake_shake',
    petpoojaItemId: 'PP-SHK-1007',
    name: 'Tiramisu Cheesecake Shake',
    description: 'Italian espresso coffee and cream cheese blended for a luscious dessert sip.',
    price: 189,
    categoryId: 'cat_shakes',
    image: '/images/menu/thick-shakes/tiramisu-cheesecake-shake.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_strawberry_cheesecake_shake',
    petpoojaItemId: 'PP-SHK-1008',
    name: 'Strawberry Cheesecake Shake',
    description: 'Fresh strawberry compote and rich cheesecake cream base blended smooth.',
    price: 189,
    categoryId: 'cat_shakes',
    image: '/images/menu/thick-shakes/strawberry-cheesecake-shake.jpg',
    available: true,
    veg: true,
  },

  // --- Category 11: Coffee & Hot Drinks ---
  {
    id: 'prd_classic_cold_coffee',
    petpoojaItemId: 'PP-BV-1101',
    name: 'Classic Cold Coffee',
    description: 'Frothy blend of robust espresso and sweetened chilled milk.',
    price: 149,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/classic-cold-coffee.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_mocha_cold_coffee',
    petpoojaItemId: 'PP-BV-1102',
    name: 'Mocha Cold Coffee',
    description: 'Frothy cold coffee infused with dark chocolate fudge sauce.',
    price: 179,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/mocha-cold-coffee.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_irish_cold_coffee',
    petpoojaItemId: 'PP-BV-1103',
    name: 'Irish Cold Coffee',
    description: 'Chilled cold coffee infused with aromatic non-alcoholic Irish cream syrup.',
    price: 179,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/irish-cold-coffee.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_hazelnut_cold_coffee',
    petpoojaItemId: 'PP-BV-1104',
    name: 'Hazelnut Cold Coffee',
    description: 'Roasted hazelnut notes blended into thick creamy iced coffee.',
    price: 179,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/hazelnut-cold-coffee.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_americano',
    petpoojaItemId: 'PP-BV-1105',
    name: 'Americano',
    description: 'Hot, bold espresso shot diluted with purified warm water.',
    price: 99,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/americano.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_cappuccino',
    petpoojaItemId: 'PP-BV-1106',
    name: 'Cappuccino',
    description: 'Classic hot espresso topped with dense textured milk foam and latte art.',
    price: 119,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/hot-cappuccino.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_latte',
    petpoojaItemId: 'PP-BV-1107',
    name: 'Latte',
    description: 'Mild, creamy hot coffee prepared with steamed milk and double espresso.',
    price: 119,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/latte.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_mocha_hot',
    petpoojaItemId: 'PP-BV-1108',
    name: 'Hot Mocha',
    description: 'Warm comforting blend of Dutch cocoa, hot espresso and velvety milk.',
    price: 139,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/hot-mocha.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_hot_chocolate',
    petpoojaItemId: 'PP-BV-1109',
    name: 'Hot Chocolate',
    description: 'Creamy, rich Belgian dark chocolate drink topped with chocolate flakes.',
    price: 149,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/hot-chocolate.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_jaggery_hot_chocolate',
    petpoojaItemId: 'PP-BV-1110',
    name: 'Jaggery Hot Chocolate',
    description: 'Warm cocoa drink sweetened with organic country jaggery.',
    price: 169,
    categoryId: 'cat_beverages',
    image: '/images/menu/beverages/jaggery-hot-chocolate.jpg',
    available: true,
    veg: true,
  },

  // --- Category 12: Desserts ---
  {
    id: 'prd_chocolate_brownie',
    petpoojaItemId: 'PP-DES-1201',
    name: 'Chocolate Brownie',
    description: 'Fudgy, dense chocolate brownie served warm with molten chocolate drizzle.',
    price: 99,
    categoryId: 'cat_desserts',
    image: '/images/menu/desserts/chocolate-brownie.jpg',
    available: true,
    veg: true,
  },

  // --- Category 13: Combos & Meals ---
  {
    id: 'prd_combo_jr_cooler',
    petpoojaItemId: 'PP-CMB-1301',
    name: 'Jr Hero Burger + Cooler',
    description: 'Combo of our crispy Jr. Hero Burger and any cooling refresher.',
    price: 119,
    categoryId: 'cat_combos',
    image: '/images/menu/combos/jr-hero-meal.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_combo_jr_meal',
    petpoojaItemId: 'PP-CMB-1302',
    name: 'Jr. Hero Burger Meal',
    description: 'Jr. Hero Burger + Salted French Fries + Chilled Coke.',
    price: 129,
    categoryId: 'cat_combos',
    image: '/images/menu/combos/jr-hero-meal.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_combo_classic_meal',
    petpoojaItemId: 'PP-CMB-1303',
    name: 'Any Classic Burger Meal',
    description: 'Your choice of Classic Burger (Hero / Mexican / Kimchi / Red Hot) + Fries + Coke.',
    price: 149,
    categoryId: 'cat_combos',
    image: '/images/menu/combos/classic-burger-meal.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_combo_great_indian_meal',
    petpoojaItemId: 'PP-CMB-1304',
    name: 'Great Indian Burger Meal',
    description: 'Great Indian 5-inch Burger served with golden French Fries and Coke.',
    price: 199,
    categoryId: 'cat_combos',
    image: '/images/menu/combos/great-indian-meal.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_combo_big_bang_meal',
    petpoojaItemId: 'PP-CMB-1305',
    name: 'Any Big Bang Burger Meal',
    description: 'Pick any 5-inch Big Bang Burger (Tandoori Paneer / Farm Fresh / Super Hero) + Fries + Drink.',
    price: 249,
    categoryId: 'cat_combos',
    image: '/images/menu/combos/big-bang-meal.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_combo_cheese_burst',
    petpoojaItemId: 'PP-CMB-1306',
    name: 'Cheese Burst Burger + Coke',
    description: 'Cheese Burst Burger with molten core paired with chilled refreshing Coke.',
    price: 219,
    categoryId: 'cat_combos',
    image: '/images/menu/combos/cheese-burst-combo.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_combo_kimchi_coffee',
    petpoojaItemId: 'PP-CMB-1307',
    name: 'Kimchi Burger + Cold Coffee',
    description: 'Spicy Korean Kimchi Burger paired with creamy Classic Cold Coffee.',
    price: 229,
    categoryId: 'cat_combos',
    image: '/images/menu/combos/kimchi-coffee-combo.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_combo_red_hot_meal',
    petpoojaItemId: 'PP-CMB-1308',
    name: 'Red Hot Spicy Meal',
    description: 'Red Hot Spicy Burger + Peri Peri Fries + Chilled Beverage.',
    price: 189,
    categoryId: 'cat_combos',
    image: '/images/menu/combos/red-hot-meal.jpg',
    available: true,
    veg: true,
  },
  {
    id: 'prd_combo_shake_burger',
    petpoojaItemId: 'PP-CMB-1309',
    name: 'Strawberry Shake + Veggie Loaded',
    description: 'Veggie Loaded Burger paired with dense Strawberry Cheesecake Shake.',
    price: 269,
    categoryId: 'cat_combos',
    image: '/images/menu/combos/strawberry-shake-veggie-combo.jpg',
    available: true,
    veg: true,
  },
];

/**
 * Synchronize the branch menu.
 *
 * LIVE (VITE_PETPOOJA_ENABLED=true): delegates to the Cloud Functions
 * `/petpooja/syncMenu` route, which pulls the Petpooja catalog with the
 * server-held key and writes `menu/{branchId}/…` directly (admin SDK),
 * stamping `lastSyncedAt` per doc. No seeds are written in live mode.
 *
 * MOCK (default): seeds the branch menu from the built-in catalog so the
 * app runs fully offline without credentials.
 */
export async function syncPetpoojaMenuForBranch(branchId: string): Promise<{
  categoriesSynced: number;
  itemsSynced: number;
  syncedAt: Date;
}> {
  const { petpoojaGateway } = await import("@/core/integrations/petpooja");
  if (petpoojaGateway.implementation === "live") {
    const { partnerFunctionsApi } = await import("./partnerFunctionsApi");
    const res = await partnerFunctionsApi.syncPetpoojaMenu(branchId);
    return {
      categoriesSynced: res.categoriesCount ?? 0,
      itemsSynced: res.itemCount ?? 0,
      syncedAt: new Date(),
    };
  }

  const batch = writeBatch(db);
  const now = Timestamp.now();

  // 1. Upsert Categories
  for (const cat of BURGONOMICS_DEFAULT_CATEGORIES) {
    const catRef = doc(db, 'menu', branchId, 'categories', cat.id);
    batch.set(
      catRef,
      {
        id: cat.id,
        name: cat.name,
        sortOrder: cat.sortOrder,
        active: cat.active,
      },
      { merge: true }
    );
  }

  // 2. Upsert Catalog Items
  for (const item of BURGONOMICS_63_ITEMS) {
    const itemRef = doc(db, 'menu', branchId, 'items', item.id);
    batch.set(
      itemRef,
      {
        ...item,
        lastSyncedAt: now,
      },
      { merge: true }
    );
  }

  // 3. Commit batch write
  await batch.commit();

  return {
    categoriesSynced: BURGONOMICS_DEFAULT_CATEGORIES.length,
    itemsSynced: BURGONOMICS_63_ITEMS.length,
    syncedAt: now.toDate(),
  };
}

/**
 * Check if the branch menu requires an hourly sync.
 */
export async function checkAndAutoSyncMenu(branchId: string): Promise<boolean> {
  try {
    const itemsSnap = await getDocs(collection(db, 'menu', branchId, 'items'));

    if (itemsSnap.empty) {
      await syncPetpoojaMenuForBranch(branchId);
      return true;
    }

    const firstDoc = itemsSnap.docs[0].data();
    const lastSynced: Timestamp | undefined = firstDoc.lastSyncedAt;

    if (!lastSynced) {
      await syncPetpoojaMenuForBranch(branchId);
      return true;
    }

    const ageInHours = (Date.now() - lastSynced.toMillis()) / (1000 * 60 * 60);
    if (ageInHours >= 1) {
      await syncPetpoojaMenuForBranch(branchId);
      return true;
    }

    return false;
  } catch (err) {
    console.warn('Error during auto-sync check:', err);
    return false;
  }
}
