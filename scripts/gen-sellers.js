const fs = require('fs');
const t = fs.readFileSync('c:/Users/Eastw Engineering/Documents/Gudong/sellers/seller-yak-bc-antiques.html', 'utf8');

function gen(d) {
  let h = t;
  h = h.replace(/Yak BC \| Yak BC Antiques \| Gudong 私家藏馆/g, d.title);
  h = h.replace(/Yak BC 私家藏馆。 Yak BC Antiques Private Museum\./g, d.desc);
  h = h.replace(/seller-yak-bc-antiques\.html/g, d.page);
  h = h.replace(/id="sellerNameZh">Yak BC</g, 'id="sellerNameZh">' + d.zh + '<');
  h = h.replace(/id="sellerNameEn">Yak BC</g, 'id="sellerNameEn">' + d.en + '<');
  h = h.replace(/id="sellerId">Yak-BC</g, 'id="sellerId">' + d.sid + '<');
  h = h.replace(/const SELLER_ID = 'Yak-BC';/g, "const SELLER_ID = '" + d.sid + "';");
  h = h.replace(/const SELLER_IMG_DIR = 'yak-bc';/g, "const SELLER_IMG_DIR = '" + d.img + "';");
  h = h.replace(/ \/ Yak BC</g, ' / ' + d.zh + '<');
  return h;
}

const ng = gen({
  title: '聚珍阁 | Ng LK Antiques | Gudong 私家藏馆',
  desc: '聚珍阁私家藏馆。 Ng LK Antiques Private Museum.',
  page: 'seller-ng-lk-antiques.html',
  zh: '聚珍阁',
  en: 'Ng LK Antiques',
  sid: 'Ng-LK',
  img: 'ng-lk'
});
fs.writeFileSync('c:/Users/Eastw Engineering/Documents/Gudong/sellers/seller-ng-lk-antiques.html', ng);
console.log('Created: seller-ng-lk-antiques.html');

const cy = gen({
  title: '博古斋 | Ng CY Antiques | Gudong 私家藏馆',
  desc: '博古斋私家藏馆。 Ng CY Antiques Private Museum.',
  page: 'seller-ng-cy-antiques.html',
  zh: '博古斋',
  en: 'Ng CY Antiques',
  sid: 'Ng-CY',
  img: 'ng-cy'
});
fs.writeFileSync('c:/Users/Eastw Engineering/Documents/Gudong/sellers/seller-ng-cy-antiques.html', cy);
console.log('Created: seller-ng-cy-antiques.html');
