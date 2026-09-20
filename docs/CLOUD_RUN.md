# نشر BadrHIS على Google Cloud Run

التطبيق يشغّل React المبني بواسطة Vite وNode API في حاوية واحدة. ملف Docker متعدد المراحل، ويعمل بمستخدم `node` بدون صلاحيات root. يستمع إلى `0.0.0.0` والمنفذ الذي توفره Cloud Run، ويدعم الإيقاف بـ SIGTERM.

## قاعدة البيانات

استخدم MongoDB Atlas أو MongoDB يمكن الوصول إليها من شبكة Cloud Run. `localhost` داخل الحاوية يشير للحاوية نفسها، وليس جهازك. الملفات والجلسات تُحفظ في MongoDB الخارجية؛ نظام ملفات Cloud Run ليس مكانًا لحفظ قاعدة البيانات.

1. أنشئ قاعدة/Cluster في Atlas، ومستخدم Database User بصلاحية `readWrite` على قاعدة `badr_his` (وليس مجرد حساب دخول Atlas).
2. من Connect → Drivers انسخ Connection String وضع اسم مستخدم قاعدة البيانات وكلمة مروره، مع URL encoding للرموز الخاصة في كلمة المرور.
3. اسم القاعدة يأتي من `MONGODB_DATABASE`؛ لو وضعت اسم قاعدة داخل الرابط مختلفًا، التطبيق يستخدم قيمة المتغير.
4. اضبط Network Access حتى يصل Cloud Run إلى Atlas. استخدم عنوان خروج ثابتًا عبر VPC وCloud NAT ثم أضف هذا العنوان إلى Atlas IP access list، أو شبكة خاصة/Private Endpoint إذا كانت خطة Atlas تدعم ذلك. لا تفترض أن عنوان جهازك المحلي هو عنوان Cloud Run.

## متغيرات البيئة

| المتغير | القيمة | الاستخدام |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb+srv://DB_USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority` | مطلوب في الإنتاج. خزّنه كـ Secret في Secret Manager ثم اربطه بنفس اسم المتغير. |
| `MONGODB_DATABASE` | `badr_his` | اسم قاعدة البيانات. الافتراضي محليًا `badr_his_local`. |
| `SETUP_TOKEN` | قيمة عشوائية سرية لا تقل عن 32 حرفًا | مطلوب في الإنتاج. حماية إنشاء أول أدمن؛ خزّنه كـ Secret. لا يُستخدم بدل كلمة مرور حسابك. |
| `NODE_ENV` | `production` | مضبوط أصلًا في Dockerfile، لتفعيل Secure cookies والتحقق من إعدادات الإنتاج. |
| `HOST` | `0.0.0.0` | مضبوط أصلًا في Dockerfile. |
| `PORT` | توفره Cloud Run تلقائيًا | اختر Container port = `8080`؛ لا تضفه يدويًا ضمن Environment variables في Cloud Run. |
| `APP_ORIGIN` | اختياري، مثل `https://badrhis-....run.app` | إن لم تحدده، تقبل الواجهة طلبات HTTPS من نفس نطاق الخدمة. إذا حددته، استخدم أصل الموقع فقط بدون مسار أو `/` في النهاية. |

لا تضف URI أو كلمات المرور كمتغيرات `VITE_*` أو Docker build arguments؛ هذه إعدادات تشغيل للسيرفر فقط. ملفات `.env` والنسخ الاحتياطية وبيانات المرضى مستبعدة من Git وDocker.

توليد SETUP_TOKEN محليًا:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## الربط من GitHub

1. افتح Cloud Run → Create service → النشر المستمر من مستودع، واربط مستودع `BadrHIS` والفرع `main`، وامنح موصل GitHub الوصول للمستودع الخاص.
2. اختر Dockerfile: المسار `Dockerfile` وسياق البناء جذر المستودع `.`.
3. اضبط Container port = `8080`، وابدأ بـ 1 CPU وذاكرة 512 MiB (ارفعها إذا تطلب الحمل ذلك).
4. اضبط **Maximum instances = 1** مبدئيًا؛ بعض عمليات الإدارة تستعمل طابور كتابة داخل نسخة التطبيق. لا ترفع عدد النسخ قبل إضافة تنسيق موزع للكتابات الإدارية.
5. أضف `MONGODB_DATABASE=badr_his` واربط أسرار `MONGODB_URI` و`SETUP_TOKEN`. حساب خدمة Cloud Run يحتاج دور Secret Manager Secret Accessor على السرَّين.
6. حدّد وصول الخدمة حسب المستخدمين المستهدفين. إذا اخترت وصولًا عامًا على Cloud Run، تظل بيانات المرضى محمية بتسجيل دخول التطبيق. لا توجد حسابات أو كلمات مرور افتراضية.
7. انشر وافتح رابط الخدمة. في أول مرة أدخل SETUP_TOKEN وأنشئ حساب المدير. عند وجود مستخدمين بالفعل تظهر شاشة تسجيل الدخول مباشرة.
8. للفحص استخدم `GET /healthz` (فحص عمل العملية). نجاح تشغيل النسخة يتطلب اتصال MongoDB وإنشاء الفهارس أولًا؛ افحص السجلات عند فشل بدء التشغيل.

احتفظ بـ SETUP_TOKEN ضمن إعدادات الإنتاج بعد إنشاء الأدمن؛ التطبيق يرفض إعداد الإنتاج الناقص، لكن مسار إنشاء الأدمن يصبح مقفولًا بمجرد وجود مستخدم.

## نقل بيانات النسخة المحلية

رفع الكود لا ينقل بيانات المرضى أو المستخدمين. الاتصال بقاعدة جديدة يبدأ بنظام فارغ. لنقل البيانات لاحقًا استخدم `mongodump` و`mongorestore` مع MongoDB Database Tools، بعد أخذ نسخة احتياطية وإيقاف الكتابة أثناء النقل. لا ترفع ملفات النسخة الاحتياطية إلى GitHub.

## التشغيل باستخدام Docker محليًا

```sh
docker compose up --build -d
```

افتح `http://127.0.0.1:8080`. هذا يشغّل MongoDB منفصلة باسم `badr_his_docker` في Volume دائم، بدون كشف منفذ MongoDB خارج شبكة الحاويات. Compose يضبط `NODE_ENV=development` للسماح بـ HTTP على جهازك. لا تستخدم إعداد Compose المحلي لنشر خدمة عامة.

```sh
docker compose down
```

الأمر السابق يحافظ على بيانات Volume. الخيار `-v` يحذف بيانات بيئة Docker؛ لا تستخدمه إلا عند الرغبة في مسحها.

## فحص البناء

```sh
npm ci
npm test
npm run build
docker build -t badrhis:latest .
```

اختبارات `npm test` تستخدم MongoDB محلية وقواعد تجريبية منفصلة. GitHub Actions ينفذ الاختبارات والبناء وDocker build على كل push إلى main.

## المراجع

- [Cloud Run container contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Cloud Run static outbound IP](https://docs.cloud.google.com/run/docs/configuring/static-outbound-ip)
- [MongoDB Atlas with Google Cloud](https://www.mongodb.com/docs/atlas/manage-connections-google-cloud/)
