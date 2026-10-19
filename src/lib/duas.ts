import * as G from "@/lib/islamic/glossary"
/**
 * Everyday duas from the Quran and authentic Sunnah. Arabic as narrated;
 * "phonetic" is a Khmer-script reading aid (Cham Muslims in Cambodia read
 * Arabic in many ways, so it approximates rather than replaces learning the
 * Arabic); km/en are translations of the meaning. Hadith numbers follow sunnah.com.
 */

export type Dua = {
  id: string
  /** When it is said. */
  title: { km: string; en: string }
  arabic: string
  phonetic: string
  latin: string
  km: string
  en: string
  source: string
}

export const DUAS: Dua[] = [
  {
    id: "wake",
    title: { km: "ពេលភ្ញាក់ពីដំណេក", en: "On waking up" },
    arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ",
    phonetic: "អាល់ហាំឌុលីល្លាហ៊ិល ឡាហ្សី អាហ៍យ៉ាណា បាអ្ទា មា អាម៉ាតាណា វ៉ាអ៊ីឡៃហិន នូស៊ូរ",
    latin: "Al-ḥamdu lillāhil-ladhī aḥyānā ba‘da mā amātanā wa ilayhin-nushūr",
    km: "ការសរសើរទាំងអស់សម្រាប់អល់ឡោះ ដែលបានប្រទានជីវិតឲ្យយើងវិញ ក្រោយពីបានធ្វើឲ្យយើងស្លាប់ (ដេកលក់) ហើយការប្រមូលផ្ដុំគឺឆ្ពោះទៅកាន់ព្រះអង្គ។",
    en: "All praise is for Allah who gave us life after causing us to die (sleep), and to Him is the resurrection.",
    source: "Sahih al-Bukhari 6312",
  },
  {
    id: "leave-home",
    title: { km: "ពេលចេញពីផ្ទះ", en: "Leaving home" },
    arabic: "بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ",
    phonetic: "ប៊ីស្មិល្លាហ៍ តាវ៉ាក់កាលតុ អាឡាល់ឡោះ វ៉ាឡា ហាវឡា វ៉ាឡា គូវវ៉ាតា អ៊ីល្លា ប៊ិល្លាហ៍",
    latin: "Bismillāh, tawakkaltu ‘alallāh, wa lā ḥawla wa lā quwwata illā billāh",
    km: "ក្នុងនាមអល់ឡោះ ខ្ញុំប្រគល់ការទុកចិត្តលើអល់ឡោះ គ្មានកម្លាំង និងអំណាចណា ក្រៅពីអល់ឡោះឡើយ។",
    en: "In the name of Allah, I place my trust in Allah; there is no might nor power except with Allah.",
    source: "Sunan Abi Dawud 5095",
  },
  {
    id: "enter-mosque",
    title: { km: "ពេលចូលវិហារ (ម៉ាស្ជិទ)", en: "Entering the mosque" },
    arabic: "اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ",
    phonetic: "អាល់ឡាហុម្ម៉ាហ្វ-តះហ៍ លី អាប-វ៉ា-បា រ៉ស់ហ៍ម៉ាទីក",
    latin: "Allāhummaftaḥ lī abwāba raḥmatik",
    km: "ឱអល់ឡោះ! សូមទ្រង់មេត្តាបើកទ្វារនៃក្តីមេត្តាករុណារបស់ទ្រង់ដល់រូបខ្ញុំ",
    en: "O Allah, open for me the doors of Your mercy.",
    source: "Sahih Muslim 713",
  },
  {
    id: "leave-mosque",
    title: { km: "ពេលចេញពីវិហារ (ម៉ាស្ជិទ)", en: "Leaving the mosque" },
    arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ",
    phonetic: "អាល់ឡាហុម្ម៉ា អ៊ិននី អាស-អាលុកា មីន ហ្វាត់-លីក",
    latin: "Allāhumma innī as’aluka min faḍlik",
    km: "ឱអល់ឡោះ! ទូលបង្គំសូមអង្វរករនូវសេចក្តីសប្បុរស និងពរជ័យពីទ្រង់",
    en: "O Allah, I ask You of Your bounty.",
    source: "Sahih Muslim 713",
  },
  {
    id: "before-eating",
    title: { km: "មុនពេលបរិភោគ", en: "Before eating" },
    arabic: "بِسْمِ اللَّهِ",
    phonetic: "ប៊ីស្មិល្លាហ៍",
    latin: "Bismillāh",
    km: "ក្នុងនាមអល់ឡោះ។ (បើភ្លេចនៅដើម សូមសូត្រ៖ ប៊ីស្មិល្លាហ៍ អាវវ៉ាឡាហ៊ូ វ៉ាអាខិរ៉ាហ៊ូ — ក្នុងនាមអល់ឡោះ ទាំងដើម និងចុង)",
    en: "In the name of Allah. (If you forgot at the start: Bismillāhi awwalahu wa ākhirah — in the name of Allah, at its beginning and its end.)",
    source: "Sahih al-Bukhari 5376 · Sunan Abi Dawud 3767",
  },
  {
    id: "after-eating",
    title: { km: "ក្រោយពេលបរិភោគ", en: "After eating" },
    // The founder's choice of du'a and meaning (19/10/2026); the reading follows the same hyphenated style.
    arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ",
    phonetic: "អាល់-ហាំ-ឌុ លិល-ឡា-ហិល ឡា-ហ្ស៊ី អាត់-អា-ម៉ា-ណា, វ៉ា-សា-ក-ណា, វ៉ា-ជា-អា-ឡា-ណា មុស-លី-មីន",
    latin: "Al-ḥamdu lillāhil-ladhī aṭ‘amanā wa saqānā wa ja‘alanā muslimīn",
    km: "រាល់ការសរសើរ និងអរគុណយ៉ាងជ្រាលជ្រៅបំផុតគឺចំពោះអល់ឡោះ ដែលទ្រង់បានប្រទានអាហារ ភេសជ្ជៈ និងបានកំណត់ឱ្យពួកយើងក្លាយជាអ្នកកាន់សាសនាឥស្លាម",
    en: "All praise is for Allah who fed us, gave us drink and made us Muslims.",
    source: "Sunan Abi Dawud 3850 · Jami' at-Tirmidhi 3457",
  },
  {
    id: "halal-provision",
    title: { km: "សុំលាភហាឡាល់ និងរួចពីបំណុល", en: "For halal provision and freedom from debt" },
    arabic: "اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ",
    phonetic: "អាល់ឡោហុំម៉ាក់ហ្វិនី ប៊ិហាឡាលិកា អាន់ ហារ៉ាមិកា វ៉ាអាហ្កនិនី ប៊ិហ្វាឌលិកា អាំម៉ាន់ ស៊ីវ៉ាក",
    latin: "Allāhummakfinī bi-ḥalālika ‘an ḥarāmik, wa aghninī bi-faḍlika ‘amman siwāk",
    km: "ឱអល់ឡោះ សូមឲ្យរបស់ហាឡាល់របស់ព្រះអង្គគ្រប់គ្រាន់សម្រាប់ខ្ញុំ ដោយមិនត្រូវការរបស់ហារ៉ាម ហើយសូមឲ្យខ្ញុំមានគ្រប់គ្រាន់ដោយការប្រោសប្រទានរបស់ព្រះអង្គ ដោយមិនពឹងលើអ្នកណាក្រៅពីព្រះអង្គ។",
    en: "O Allah, suffice me with what You have made lawful instead of what You have forbidden, and make me independent by Your bounty of all besides You.",
    source: "Jami' at-Tirmidhi 3563",
  },
  {
    id: "worry-debt",
    title: { km: "ពេលព្រួយបារម្ភ និងមានបំណុល", en: "In worry and debt" },
    arabic: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ",
    phonetic: "អាល់ឡោហុំម៉ា អ៊ិន្នី អាអ៊ូហ្សុ ប៊ិកា មិណាល់ ហាំមិ វ៉ាល់ ហាហ្សានិ វ៉ាល់ អាជហ្សិ វ៉ាល់ កាសាលិ វ៉ាល់ ជុបនិ វ៉ាល់ ប៊ុខលិ វ៉ា ឌ្វាឡាអ៊ិដ ដៃនិ វ៉ា ហ្កាឡាបាទិរ រីជាល",
    latin: "Allāhumma innī a‘ūdhu bika minal-hammi wal-ḥazan, wal-‘ajzi wal-kasal, wal-jubni wal-bukhl, wa ḍala‘id-dayni wa ghalabatir-rijāl",
    km: "ឱអល់ឡោះ ខ្ញុំសុំការការពារពីព្រះអង្គ ពីការព្រួយបារម្ភ និងទុក្ខសោក ពីភាពអស់សមត្ថភាព និងខ្ជិលច្រអូស ពីភាពកំសាក និងកំណាញ់ ពីបន្ទុកបំណុល និងការត្រួតត្រារបស់មនុស្ស។",
    en: "O Allah, I seek refuge in You from worry and grief, from incapacity and laziness, from cowardice and miserliness, from the burden of debt and from being overpowered by men.",
    source: "Sahih al-Bukhari 6369",
  },
  {
    id: "fast-niyyah",
    title: { km: `${G.NIYYAH}បួស (ពេល${G.SAHUR})`, en: "Intention to fast (niyyah)" },
    // The Shafi'i formula for Ramadan (founder, 19/10/2026). The intention itself is in the heart; for a sunnah fast
    // one intends that fast instead. Not a hadith text — its source line says so.
    arabic: "نَوَيْتُ صَوْمَ غَدٍ عَنْ أَدَاءِ فَرْضِ شَهْرِ رَمَضَانَ هَذِهِ السَّنَةِ لِلَّهِ تَعَالَى",
    phonetic: "ណា-វ៉ៃ-តុ សោវ-ម៉ា ហ្កា-ឌិន អាន់ អា-ដា-អ៊ិ ហ្វាដ-ឌិ ស្យាហ្រ-រិ រ៉ា-ម៉ា-ដន ហា-ហ្ស៊ិ-ហិស សា-ណា-ទិ លិល-ឡា-ហិ តា-អា-ឡា",
    latin: "Nawaitu ṣawma ghadin ‘an adā’i farḍi shahri Ramaḍāna hādhihis-sanati lillāhi ta‘ālā",
    km: `ខ្ញុំតាំងចិត្តបួសនៅថ្ងៃស្អែក ដើម្បីបំពេញកាតព្វកិច្ចខែរ៉ាម៉ាឌន (ឬ${G.SUNNAH_FAST}) ដើម្បីអល់ឡោះជាម្ចាស់ ﷻ`,
    en: "I intend to fast tomorrow to fulfil the obligation of this year's Ramadan, for Allah the Exalted. (For a sunnah fast, intend that fast instead.)",
    source: "Niyyah — the Shafi'i formula; the intention is in the heart (Sahih al-Bukhari 1)",
  },
  {
    id: "iftar",
    title: { km: `ពេល${G.IFTAR} (អ៊ីហ្វតារ)`, en: "Breaking the fast (iftar)" },
    arabic: "ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ",
    // The founder's reading and meaning (19/10/2026), syllable by syllable — natural Khmer, not a word-for-word gloss.
    phonetic: "ហ្សា-ហា-បា អាស-ហ្សា-ម៉ា-អ៊ុ, វ៉ា-អ៊ីប-តាល់-ឡា-ទីល អ៊ុ-រូ-ក, វ៉ា-សា-បា-តាល់ អាជ-រុ, អ៊ីន-ស្យា-អល់-ឡោះ",
    latin: "Dhahabaẓ-ẓama’u wabtallatil-‘urūqu wa thabatal-ajru in shā’ Allāh",
    km: "ភាពស្រេកទឹកបានរសាយបាត់ សរសៃឈាមទាំងឡាយបានទទួលសំណើមឡើងវិញ ហើយផលបុណ្យកុសលត្រូវបានបញ្ជាក់ជាប្រាកដ ប្រសិនបើអល់ឡោះទ្រង់សព្វព្រះទ័យ។",
    en: "The thirst has gone, the veins are moistened, and the reward is certain, if Allah wills.",
    source: "Sunan Abi Dawud 2357",
  },
  {
    id: "travel",
    title: { km: "ពេលធ្វើដំណើរ", en: "Setting out on a journey" },
    arabic: "سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ",
    phonetic: "ស៊ុបហាណាល់ឡាហ្ស៊ី សាក់ខរ៉ូ ឡាណា ហាហ៊្សា វ៉ាម៉ា គុណ្ណា ឡាហុ មូករីនីន, វ៉ាអ៊ីណ្ណា អ៊ីឡា រ៉បពីណា ឡាមុនកល់លីប៊ូន",
    latin: "Subḥānal-ladhī sakhkhara lanā hādhā wa mā kunnā lahu muqrinīn, wa innā ilā rabbinā lamunqalibūn",
    km: "មហាស្អាតស្អំ និងមហាបរិសុទ្ធបំផុតគឺអល់ឡោះ ដែលទ្រង់បានប្រទានយានជំនិះនេះជាប្រយោជន៍ដល់ពួកយើង ខណៈដែលពួកយើងគ្មានលទ្ធភាពបញ្ជាវាដោយខ្លួនឯងបានឡើយ ហើយពិតប្រាកដណាស់ ពួកយើងនឹងត្រូវវិលត្រឡប់ទៅកាន់ម្ចាស់របស់យើងវិញ",
    en: "Glory be to the One who has subjected this to us, though we could never have done so ourselves; and surely to our Lord we shall return.",
    source: "Az-Zukhruf 43:13–14 · Sahih Muslim 1342",
  },
  {
    id: "both-worlds",
    title: { km: "សុំសេចក្ដីល្អក្នុងលោកទាំងពីរ", en: "Good in both worlds" },
    arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
    phonetic: "រ៉ប្បាណា អាទិណា ហ្វិដ ឌុនយ៉ា ហាសាណាតាន់ វ៉ាហ្វិល អាខិរ៉ាទិ ហាសាណាតាន់ វ៉ាគិណា អាហ្សាបាន់ណារ",
    latin: "Rabbanā ātinā fid-dunyā ḥasanatan wa fil-ākhirati ḥasanatan wa qinā ‘adhāban-nār",
    km: "ឱព្រះជាម្ចាស់នៃយើង សូមប្រទានដល់យើងនូវសេចក្ដីល្អក្នុងលោកនេះ និងសេចក្ដីល្អក្នុងលោកខាងមុខ ហើយសូមការពារយើងពីទារុណកម្មនៃភ្លើងនរក។",
    en: "Our Lord, give us good in this world and good in the Hereafter, and protect us from the punishment of the Fire.",
    source: "Al-Baqarah 2:201",
  },
  {
    id: "sleep",
    title: { km: "មុនពេលចូលគេង", en: "Before sleeping" },
    arabic: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا",
    phonetic: "ប៊ិស្មិកា អាល់ឡោហុំម៉ា អាមូទុ វ៉ាអាហ៍យ៉ា",
    latin: "Bismika Allāhumma amūtu wa aḥyā",
    km: "ក្នុងនាមព្រះអង្គ ឱអល់ឡោះ ខ្ញុំស្លាប់ (ដេក) និងរស់ (ភ្ញាក់)។",
    en: "In Your name, O Allah, I die and I live.",
    source: "Sahih al-Bukhari 6312",
  },
]
