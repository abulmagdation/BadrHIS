const knownNames={
 'محمد':'Mohamed','احمد':'Ahmed','محمود':'Mahmoud','مصطفي':'Mostafa','ابراهيم':'Ibrahim','اسماعيل':'Ismail','اسحاق':'Ishaq','ايمن':'Ayman','ايمان':'Eman','اسلام':'Eslam','اسامه':'Osama','ايهاب':'Ehab','اشرف':'Ashraf','اكرم':'Akram','ادهم':'Adham','ادم':'Adam','انور':'Anwar','امال':'Amal','اماني':'Amani','اميره':'Amira','ابتسام':'Ebtisam','ايناس':'Enas','اسماء':'Asmaa','ايه':'Aya',
 'محب':'Moheb','حسن':'Hassan','حسين':'Hussein','حسام':'Hossam','حامد':'Hamed','حماده':'Hamada','حمدي':'Hamdy','خالد':'Khaled','خليل':'Khalil','سيد':'Sayed','سعيد':'Said','سعد':'Saad','سامي':'Samy','سامح':'Sameh','سمير':'Samir','شريف':'Sherif','طارق':'Tarek','عاطف':'Atef','عادل':'Adel','علي':'Ali','عمر':'Omar','عثمان':'Othman','عمرو':'Amr','عماد':'Emad','عصام':'Essam',
 'عبدالله':'Abdallah','عبدالرحمن':'Abdelrahman','عبدالعزيز':'Abdelaziz','عبدالحليم':'Abdelhalim','عبدالحبيب':'Abdelhabib','عبدالغفار':'Abdelghaffar','عبداللطيف':'Abdellatif','عبدالحميد':'Abdelhamid','عبدالقادر':'Abdelkader','عبدالمنعم':'Abdelmonem','عبدالفتاح':'Abdelfattah','عبدالوهاب':'Abdelwahab','عبدالواحد':'Abdelwahed','عبدالكريم':'Abdelkarim',
 'فتحي':'Fathy','فواد':'Fouad','كمال':'Kamal','كريم':'Karim','مجدي':'Magdy','مدحت':'Medhat','مراد':'Mourad','مروان':'Marwan','منصور':'Mansour','ناصر':'Nasser','نبيل':'Nabil','وليد':'Walid','ياسر':'Yasser','يوسف':'Youssef','هاني':'Hany','هشام':'Hisham','هيثم':'Haitham','مينا':'Mina','بطرس':'Boutros','جرجس':'Girgis','شنوده':'Shenouda','كيرلس':'Kyrillos','ابانوب':'Abanoub',
 'هبه':'Heba','مريم':'Mariam','ساره':'Sara','سمر':'Samar','سما':'Sama','شهد':'Shahd','شيماء':'Shaimaa','فاطمه':'Fatma','نورا':'Nora','نواره':'Nawara','عاليه':'Alia','عواطف':'Awatef','منه':'Menna','ملك':'Malak','مي':'Mai','مها':'Maha','نهي':'Noha','ناديه':'Nadia','نجلاء':'Naglaa','نجوي':'Nagwa','نحمده':'Nehmeda','ريم':'Reem','رانيا':'Rania','دينا':'Dina','دعاء':'Doaa','رحاب':'Rehab','عايشه':'Aisha','زينب':'Zeinab','خديجه':'Khadiga','حنان':'Hanan','سعاد':'Souad','صباح':'Sabah','صفاء':'Safaa','وفاء':'Wafaa','نسرين':'Nesreen','جيهان':'Gihan','هناء':'Hanaa',
 'صابر':'Saber','صابرين':'Sabreen','ماهر':'Maher','رضوان':'Radwan','عطيه':'Attia','الشعراوي':'Elshaarawy','الشحات':'Elshehat','لبيب':'Labib','طانيوس':'Tanious','بخيت':'Bekhit','سلطان':'Sultan','مرسي':'Morsi','خلف':'Khalaf','مزيد':'Mazeed'
};

const letters={'ا':'a','ب':'b','ت':'t','ث':'th','ج':'g','ح':'h','خ':'kh','د':'d','ذ':'z','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z','ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','ة':'a','و':'o','ي':'i','ء':'','ﻻ':'la'};
const normalizeArabic=value=>String(value||'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u06D6-\u06EDـ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ى/g,'ي').replace(/ة/g,'ه').trim();
const title=value=>value?value[0].toUpperCase()+value.slice(1):'';

function transliterateWord(raw){
 const word=normalizeArabic(raw);
 if(!word)return '';
 if(knownNames[word])return knownNames[word];
 if(!/[\u0600-\u06FF]/.test(word))return title(word.toLowerCase());
 if(word.startsWith('ال')&&word.length>2)return 'El'+title(transliterateWord(word.slice(2))).replace(/^El/,'');
 const phonetic=[...word].map(letter=>letters[letter]??'').join('').replace(/aa+/g,'a').replace(/ii+/g,'i').replace(/oo+/g,'o');
 return title(phonetic);
}

export function transliterateArabicName(value){
 return normalizeArabic(value).split(/\s+/).filter(Boolean).slice(0,3).map(transliterateWord).filter(Boolean).join(' ');
}
