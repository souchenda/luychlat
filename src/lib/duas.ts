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
    arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلَا قُوَّةٍ",
    phonetic: "អាល់ហាំឌុលីល្លាហ៊ិល ឡាហ្សី អាត់អាំម៉ានី ហាហ្សា វ៉ារ៉ហ្សាកានីហ៊ី មិន ហ្កៃរី ហាវលិន មិននី វ៉ាឡា គូវវ៉ះ",
    latin: "Al-ḥamdu lillāhil-ladhī aṭ‘amanī hādhā wa razaqanīhi min ghayri ḥawlin minnī wa lā quwwah",
    km: "ការសរសើរទាំងអស់សម្រាប់អល់ឡោះ ដែលបានប្រទានអាហារនេះដល់ខ្ញុំ និងផ្ដល់វាជាលាភសក្ការៈដល់ខ្ញុំ ដោយគ្មានកម្លាំង ឬអំណាចពីខ្លួនខ្ញុំឡើយ។",
    en: "All praise is for Allah who fed me this and provided it for me without any might or power from myself.",
    source: "Sunan Abi Dawud 4023 · Jami' at-Tirmidhi 3458",
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
    id: "iftar",
    title: { km: "ពេលបើកបួស (អ៊ីហ្វតារ)", en: "Breaking the fast (iftar)" },
    arabic: "ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ",
    phonetic: "ហ្សាហាបាហ្ស ហ្សោម៉អ៊ុ វ៉ាប់តាល់ឡាទិល អ៊ូរ៉ូគុ វ៉ាសាបាតាល់ អាជរុ អ៊ិនស្សាអាល់ឡោះ",
    latin: "Dhahabaẓ-ẓama’u wabtallatil-‘urūqu wa thabatal-ajru in shā’ Allāh",
    km: "ការស្រេកទឹកបានបាត់ សរសៃបានស្រស់ឡើងវិញ ហើយផលបុណ្យត្រូវបានកំណត់ ប្រសិនបើអល់ឡោះមានចេតនា។",
    en: "The thirst has gone, the veins are moistened, and the reward is certain, if Allah wills.",
    source: "Sunan Abi Dawud 2357",
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
