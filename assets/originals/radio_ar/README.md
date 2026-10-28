# أصوات اللاسلكي بالسعودي

كل الأسطر اللي تقولها اللعبة على اللاسلكي والاتصال الداخلي، بالسعودي، لتنضاف خيارًا جنب الإنجليزي («اللاسلكي: English / عربي» في الإعدادات).
الجدول نفسه في `lines.csv` (يفتح في Excel)، ومنه تقدر تولّدها دفعة وحدة لو استخدمت مولّد أصوات.

## المتكلمين (٦ أصوات)

- **الصياد** (74 سطر): المراقب الجوي الأرضي (JTAC) مع القوات على الأرض. رجل بين ٣٠ و٤٠ سنة، لهجة نجدية. صوته مشدود وسريع شوي، كأنه في معركة ويسمع الرمي حوله. يكلّم الأباتشي والـ F-15 كلهم.
- **طيار الأباتشي** (20 سطر): الطيار في المقعد الأمامي، يكلّمك على الاتصال الداخلي. رجل، هادي ومركّز، وصوته يرتفع بس مع الصواريخ والإصابة.
- **طيار الـ F-15** (111 سطر): الطيار في المقعد الأمامي للـ F-15SA، يكلّمك وأنت ضابط الأسلحة خلفه. رجل، احترافي وهادي جدًا، وكلامه قصير. وفي التدريب يتكلم مثل مدرّب صبور.
- **العمليات** (12 سطر): مركز العمليات. رجل، رسمي وهادي، كأنه يقرأ أوامر من غرفة العمليات.
- **الطاقم الأرضي** (2 سطر): فني التذخير في القاعدة. رجل، عادي ومرتاح.
- **صوت التحذير** (5 سطر): صوت الطائرة الآلي في السماعة. امرأة، جاف وثابت، بلا مشاعر.

## طريقة التسجيل

- كل سطر في ملف لحاله، واسمه بالضبط مثل عمود «الملف» (مثلًا `ah64/h.tic.wav`)، في مجلدين: `ah64` و`f15`.
- صوت نظيف وجاف: بلا مؤثر لاسلكي، وبلا موسيقى، وبلا صدى. اللعبة تضيف صوت اللاسلكي بنفسها.
- WAV أو MP3، وأي جودة من ٢٤ كيلوهرتز وفوق. نص ثانية سكوت قبل وبعد يكفي، وأنا أقصّ الباقي.
- **الأسطر اللي تنتهي بفاصلة (،) قطع تنركّب ورا بعض**، مثلًا: «سيارة مسلّحة،» + «ثلاثمية متر،» + «شمال موقعي.» تصير جملة وحدة. سجّلها بنبرة مكمّلة (ما تنزل في آخرها)، وبنفس السرعة والقوة.
- الأزرار (NEXT وTRACK وZOOM وSMS وA S وL G B وA G M) تنقال بالإنجليزي مثل ما هي مكتوبة على الشاشات.
- «حوّل» في آخر النداء معناها أنتظر ردك، و«انتهى» يعني ما أنتظر رد.

## الأباتشي

### الصياد (64)

| الملف | السطر | بالإنجليزي |
|---|---|---|
| `ah64/h.tic.wav` | صقر، هنا الصياد. قواتنا في اشتباك! نطلب إسناد جوي قريب فورًا، حوّل. | Saqr, Hunter. Troops in contact! Requesting immediate close air support, over. |
| `ah64/h.ff.wav` | أوقف الرمي، أوقف الرمي! تضرب قواتنا! | Cease fire, cease fire! You're hitting friendlies! |
| `ah64/h.ffkill.wav` | أوقف الرمي! أوقف الرمي! عندنا إصابة من قواتنا! | Cease fire! Cease fire! Friendly down! |
| `ah64/h.cas.wav` | صقر، هنا الصياد. عندنا إصابات. نبي الإسناد الحين، حوّل. | Saqr, Hunter. We have casualties. We need that support now, over. |
| `ah64/h.halt.wav` | صقر، هنا الصياد. القافلة وقفت، وتحت النار، حوّل. | Saqr, Hunter. Convoy is halted, taking fire, over. |
| `ah64/h.move.wav` | صقر، هنا الصياد. الطريق نظيف، القافلة تتحرك، حوّل. | Saqr, Hunter. Road is clear, convoy is moving, over. |
| `ah64/h.in.wav` | صقر، هنا الصياد. القافلة وصلت. مشكورين على الحماية، انتهى. | Saqr, Hunter. Convoy is at destination. Thanks for the cover, out. |
| `ah64/h.call.wav` | صقر، هنا الصياد. | Saqr, Hunter. |
| `ah64/h.mark.wav` | معلّم بدخان أحمر، الليزر واحد خمسة ثمانية ثمانية. حوّل. | Marked with red smoke, laser one five eight eight. Over. |
| `ah64/h.t.TECH.wav` | سيارة مسلّحة، | Technical, |
| `ah64/h.t.MRAP.wav` | مدرّعة، | Armored vehicle, |
| `ah64/h.t.TRK.wav` | شاحنة، | Truck, |
| `ah64/h.t.FUEL.wav` | صهريج وقود، | Fuel truck, |
| `ah64/h.t.TEL.wav` | راجمة صواريخ، | Rocket launcher, |
| `ah64/h.t.SUV.wav` | جيب، | SUV, |
| `ah64/h.t.PAX.wav` | أفراد معادين، | Enemy dismounts, |
| `ah64/h.d.50.wav` | خمسين متر، | fifty meters |
| `ah64/h.d.100.wav` | مية متر، | one hundred meters |
| `ah64/h.d.150.wav` | مية وخمسين متر، | one hundred fifty meters |
| `ah64/h.d.200.wav` | ميتين متر، | two hundred meters |
| `ah64/h.d.250.wav` | ميتين وخمسين متر، | two hundred fifty meters |
| `ah64/h.d.300.wav` | ثلاثمية متر، | three hundred meters |
| `ah64/h.d.350.wav` | ثلاثمية وخمسين متر، | three hundred fifty meters |
| `ah64/h.d.400.wav` | أربعمية متر، | four hundred meters |
| `ah64/h.d.450.wav` | أربعمية وخمسين متر، | four hundred fifty meters |
| `ah64/h.d.500.wav` | خمسمية متر، | five hundred meters |
| `ah64/h.d.550.wav` | خمسمية وخمسين متر، | five hundred fifty meters |
| `ah64/h.d.600.wav` | ستمية متر، | six hundred meters |
| `ah64/h.d.650.wav` | ستمية وخمسين متر، | six hundred fifty meters |
| `ah64/h.d.700.wav` | سبعمية متر، | seven hundred meters |
| `ah64/h.d.750.wav` | سبعمية وخمسين متر، | seven hundred fifty meters |
| `ah64/h.d.800.wav` | ثمانمية متر، | eight hundred meters |
| `ah64/h.d.850.wav` | ثمانمية وخمسين متر، | eight hundred fifty meters |
| `ah64/h.d.900.wav` | تسعمية متر، | nine hundred meters |
| `ah64/h.d.950.wav` | تسعمية وخمسين متر، | nine hundred fifty meters |
| `ah64/h.d.1000.wav` | ألف متر، | one thousand meters |
| `ah64/h.d.1100.wav` | ألف ومية متر، | one thousand one hundred meters |
| `ah64/h.d.1200.wav` | ألف وميتين متر، | one thousand two hundred meters |
| `ah64/h.d.1300.wav` | ألف وثلاثمية متر، | one thousand three hundred meters |
| `ah64/h.d.1400.wav` | ألف وأربعمية متر، | one thousand four hundred meters |
| `ah64/h.d.1500.wav` | ألف وخمسمية متر، | one thousand five hundred meters |
| `ah64/h.d.1600.wav` | ألف وستمية متر، | one thousand six hundred meters |
| `ah64/h.d.1700.wav` | ألف وسبعمية متر، | one thousand seven hundred meters |
| `ah64/h.d.1800.wav` | ألف وثمانمية متر، | one thousand eight hundred meters |
| `ah64/h.d.1900.wav` | ألف وتسعمية متر، | one thousand nine hundred meters |
| `ah64/h.d.2000.wav` | ألفين متر، | two thousand meters |
| `ah64/h.d.2100.wav` | ألفين ومية متر، | two thousand one hundred meters |
| `ah64/h.d.2200.wav` | ألفين وميتين متر، | two thousand two hundred meters |
| `ah64/h.d.2300.wav` | ألفين وثلاثمية متر، | two thousand three hundred meters |
| `ah64/h.d.2400.wav` | ألفين وأربعمية متر، | two thousand four hundred meters |
| `ah64/h.d.2500.wav` | ألفين وخمسمية متر، | two thousand five hundred meters |
| `ah64/h.d.2600.wav` | ألفين وستمية متر، | two thousand six hundred meters |
| `ah64/h.d.2700.wav` | ألفين وسبعمية متر، | two thousand seven hundred meters |
| `ah64/h.d.2800.wav` | ألفين وثمانمية متر، | two thousand eight hundred meters |
| `ah64/h.d.2900.wav` | ألفين وتسعمية متر، | two thousand nine hundred meters |
| `ah64/h.d.3000.wav` | ثلاثة آلاف متر، | three thousand meters |
| `ah64/h.dir.NORTH.wav` | شمال موقعي. | north of my position. |
| `ah64/h.dir.NORTHEAST.wav` | شمال شرق موقعي. | north-east of my position. |
| `ah64/h.dir.EAST.wav` | شرق موقعي. | east of my position. |
| `ah64/h.dir.SOUTHEAST.wav` | جنوب شرق موقعي. | south-east of my position. |
| `ah64/h.dir.SOUTH.wav` | جنوب موقعي. | south of my position. |
| `ah64/h.dir.SOUTHWEST.wav` | جنوب غرب موقعي. | south-west of my position. |
| `ah64/h.dir.WEST.wav` | غرب موقعي. | west of my position. |
| `ah64/h.dir.NORTHWEST.wav` | شمال غرب موقعي. | north-west of my position. |

### طيار الأباتشي (20)

| الملف | السطر | بالإنجليزي |
|---|---|---|
| `ah64/p.fire.wav` | علينا نار، | Taking fire, |
| `ah64/p.msl.wav` | إطلاق صاروخ، | Missile launch, |
| `ah64/p.break.wav` | مشاعل! أنعطف! | Flares! Breaking! |
| `ah64/p.hit.wav` | انضربنا قوي. الطيارة ثقلت. | We're hit hard. She's getting heavy. |
| `ah64/p.mayday.wav` | نداء استغاثة، نداء استغاثة، نداء استغاثة! صقر طايح! | Mayday, mayday, mayday! Saqr is going down! |
| `ah64/p.lift.wav` | صقر، إقلاع. | Saqr, lifting. |
| `ah64/p.rtb.wav` | راجعين للقاعدة. | Returning to base. |
| `ah64/p.down.wav` | هبطنا. | Touchdown. |
| `ah64/p.clock.1.wav` | على الساعة وحدة! | one o'clock! |
| `ah64/p.clock.2.wav` | على الساعة ثنتين! | two o'clock! |
| `ah64/p.clock.3.wav` | على الساعة ثلاث! | three o'clock! |
| `ah64/p.clock.4.wav` | على الساعة أربع! | four o'clock! |
| `ah64/p.clock.5.wav` | على الساعة خمس! | five o'clock! |
| `ah64/p.clock.6.wav` | على الساعة ست! | six o'clock! |
| `ah64/p.clock.7.wav` | على الساعة سبع! | seven o'clock! |
| `ah64/p.clock.8.wav` | على الساعة ثمان! | eight o'clock! |
| `ah64/p.clock.9.wav` | على الساعة تسع! | nine o'clock! |
| `ah64/p.clock.10.wav` | على الساعة عشر! | ten o'clock! |
| `ah64/p.clock.11.wav` | على الساعة احدعش! | eleven o'clock! |
| `ah64/p.clock.12.wav` | على الساعة اثنعش! | twelve o'clock! |

### العمليات (4)

| الملف | السطر | بالإنجليزي |
|---|---|---|
| `ah64/o.down.wav` | صقر، هنا العمليات. كل الأهداف انتهت. انتظر مهمة جديدة. | Saqr, Ops. All targets down. Stand by for new tasking. |
| `ah64/o.done.wav` | صقر، هنا العمليات. المهمة انتهت. ارجع للقاعدة، انتهى. | Saqr, Ops. Mission complete. Return to base, out. |
| `ah64/o.ph.NEW_TASKING_TROOPS_IN_CONTACT_AT_THE_WADI_CROSSING.wav` | صقر، هنا العمليات. مهمة جديدة: قواتنا في اشتباك عند عبور الوادي. إذا جاهز توكّل، حوّل. | Saqr, Ops. New tasking: troops in contact at the wadi crossing. Proceed when ready, over. |
| `ah64/o.ph.NEW_TASKING_FRIENDLIES_AT_THE_PORT_DEPOT_UNDER_FIRE.wav` | صقر، هنا العمليات. مهمة جديدة: قوة صديقة عند مستودعات الميناء تحت النار. إذا جاهز توكّل، حوّل. | Saqr, Ops. New tasking: friendlies at the port depot under fire. Proceed when ready, over. |

### الطاقم الأرضي (2)

| الملف | السطر | بالإنجليزي |
|---|---|---|
| `ah64/c.rearm.wav` | صقر، هنا الطاقم الأرضي. بدينا التذخير والتزويد بالوقود. | Saqr, ground crew. Starting rearm and refuel. |
| `ah64/c.ready.wav` | صقر، تم التذخير والتزويد. المنطقة نظيفة. | Saqr, you're rearmed and refueled. Area is clear. |

## الـ F-15SA

### الصياد (10)

| الملف | السطر | بالإنجليزي |
|---|---|---|
| `f15/h.j.civ.wav` | صقر واحد واحد، هنا الصياد. انتظر، انتظر. فيه مدنيين قريب من الهدف. | Saqr one-one, Hunter. Hold, hold. Civilians near the target. |
| `f15/h.j.check.wav` | صقر واحد واحد، هنا الصياد. وصلت. الهدف قافلة سيارات على الطريق الرئيسي، الإحداثيات في نظامك. بلّغ إذا شفته، حوّل. | Saqr one-one, Hunter. Good copy. Target is a vehicle convoy on the main road, grid in your system. Report tally, over. |
| `f15/h.j.go.wav` | صقر واحد واحد، هنا الصياد. وصلت. الأهداف في نظامك. بلّغ إذا شفتها، حوّل. | Saqr one-one, Hunter. Good copy. Targets are in your system. Report tally, over. |
| `f15/h.j.hot.wav` | صقر واحد واحد، مصرّح لك بالرمي. | Saqr one-one, cleared hot. |
| `f15/h.j.cont.wav` | صقر واحد واحد، استمر. | Saqr one-one, continue. |
| `f15/h.j.abort.wav` | إلغاء، إلغاء، إلغاء! | Abort, abort, abort! |
| `f15/h.j.good.wav` | إصابات زينة. الهدف تدمّر. | Good hits. Target destroyed. |
| `f15/h.j.miss.wav` | ما صابت. مصرّح لك تعيد الهجمة. | Miss. Re-attack approved. |
| `f15/h.j.ff.wav` | أوقف الرمي، أوقف الرمي! قواتنا في المنطقة! | Check fire, check fire! Friendlies in the area! |
| `f15/h.dc.wav` | صقر واحد واحد، هنا الصياد. قريب خطر، هذا قريب منّا مرة. ممنوع القنبلة. استخدم المافريك. | Saqr one-one, Hunter. Danger close, that is too close to us. Not cleared for the bomb. Use the Maverick. |

### طيار الـ F-15 (111)

| الملف | السطر | بالإنجليزي |
|---|---|---|
| `f15/f.fence.wav` | دخلنا منطقة العمليات. التسليح الرئيسي شغّال، الحاضنة لك. | Fence in. Master arm on, pod is yours. |
| `f15/f.tally.wav` | الهدف في الحاضنة. جاهز للهجمة، القرار لك. | Got the target in the pod. Ready for the run, your call. |
| `f15/f.ask.wav` | أدخل عليه؟ | Want me to take it in? |
| `f15/f.copyin.wav` | تمام، داخل. | Copy, turning in. |
| `f15/f.copyhold.wav` | تمام، باقي في المدار. | Copy, staying in the orbit. |
| `f15/f.wings.wav` | الأجنحة مستوية. التوجيه تمام. | Wings level. Steering is good. |
| `f15/f.min.wav` | دقيقة. | One minute. |
| `f15/f.30.wav` | ثلاثين ثانية. | Thirty seconds. |
| `f15/f.10.wav` | عشر ثواني. | Ten seconds. |
| `f15/f.inrange.wav` | في المدى. | In range. |
| `f15/f.count.wav` | الإسقاط بعد ثلاث، اثنين، واحد. | Release in three, two, one. |
| `f15/f.bombs.wav` | القنابل نزلت. | Bombs away. |
| `f15/f.bomb.wav` | القنبلة نزلت. | Bomb away. |
| `f15/f.rifle.wav` | الصاروخ انطلق. | Rifle. |
| `f15/f.off.wav` | طالع من الهدف، لفّة يسار. | Off target, coming left. |
| `f15/f.lase.wav` | ابدأ الليزر. | Start lasing. |
| `f15/f.laser.wav` | الليزر شغّال. | Laser on. |
| `f15/f.splash.wav` | إصابة. | Splash. |
| `f15/f.shack.wav` | في الصميم! ضربة ممتازة. | Shack! Good hit. |
| `f15/f.long.wav` | طاحت بعيد. | Missed long. |
| `f15/f.short.wav` | طاحت قصير. | Missed short. |
| `f15/f.again.wav` | نعيد مرة ثانية؟ | Want another pass? |
| `f15/f.abort.wav` | إلغاء، إلغاء. طالعين بدون إسقاط. | Abort, abort. Coming off dry. |
| `f15/f.lost.wav` | ضاع الهدف. ألغيت الهجمة. | Lost the target. Aborting the run. |
| `f15/f.joker.wav` | الوقود قرّب. باقي لنا كم هجمة. | Joker fuel. A couple more passes. |
| `f15/f.bingo.wav` | وصلنا حد الرجعة. راجعين للبيت. | That's bingo. We're heading home. |
| `f15/f.spike.wav` | رادار علينا، | Spike, |
| `f15/f.launch.wav` | إطلاق صاروخ! | Missile launch! |
| `f15/f.flaresL.wav` | مشاعل! لفّة يسار! | Flares! Breaking left! |
| `f15/f.flaresR.wav` | مشاعل! لفّة يمين! | Flares! Breaking right! |
| `f15/f.defeat.wav` | الصاروخ راح. راجعين للمدار. | Missile defeated. Back to the orbit. |
| `f15/f.pid.wav` | ما أقدر أأكده للحين. قرّب الصورة، خلني أشوف زين. | Can't confirm it yet. Zoom in, give me a closer look. |
| `f15/f.civ.wav` | فيه مدنيين عند الهدف. إلغاء. | Civilians in the target area. Aborting. |
| `f15/f.r.tally.wav` | الصياد، هنا صقر واحد واحد. الهدف عندي. | Hunter, Saqr one-one. Tally target. |
| `f15/f.smoke.wav` | دخان فوق الهدف. ضاعت نقطة الليزر. | Smoke over the target. Lost the spot. |
| `f15/f.t1.wav` | حيّاك. أنا أطير، وأنت عليك الحاضنة والأسلحة. صورة الحاضنة يسار الشاشة الكبيرة. اضغط NEXT عشان تحطها على هدف. | Welcome aboard. I'll fly, you work the pod and the weapons. Your pod is on the left of the big display. Press NEXT to put it on a target. |
| `f15/f.t2.wav` | زين. الحين اضغط TRACK، والحاضنة بتمسكه. | Good. Now press TRACK, and the pod will hold it. |
| `f15/f.t3.wav` | قرّب الصورة عشان نشوف وش هو. اضغط ZOOM. | Zoom in, so we can see what it is. Press ZOOM. |
| `f15/f.t4.wav` | هذي الشاحنة، الهدف تأكد. الحين جهّز السلاح. في صفحة SMS اضغط A S، جو أرض. | That's the truck, target identified. Now arm up. On the S M S page, press A S, air to surface. |
| `f15/f.t5.wav` | اختر القنبلة الموجهة بالليزر. اضغط L G B. | Select the laser bomb. Press L G B. |
| `f15/f.t6.wav` | أنا جاهز للهجمة. اضغط الزناد في يدّة التحكم اليمين، وأنا أدخّلنا. | I'm ready for the run. Squeeze the trigger on your right hand controller, and I'll take us in. |
| `f15/f.t7.wav` | خلّ الحاضنة على الهدف. القنبلة تنزل لحالها عند نقطة الإسقاط. | Keep the pod on the target. The bomb comes off by itself at the release point. |
| `f15/f.t8.wav` | القنبلة نزلت. خلّ الليزر عليها لين تصيب. | Bomb's away. Keep lasing it until it hits. |
| `f15/f.t9.wav` | ضربة زينة. الحين الدبابة. اضغط NEXT، وامسكها، وقرّب الصورة. | Good hit. Now the tank. Press NEXT, track it, and zoom in. |
| `f15/f.t10.wav` | اختر المافريك. اضغط A G M. | Select the Maverick. Press A G M. |
| `f15/f.t11.wav` | اضغط الزناد. وأنا أوجّه الخشم عليها. | Squeeze the trigger. I'll point the nose at it. |
| `f15/f.t12.wav` | في المدى. أطلق. اضغط الزناد. | In range. Fire it. Squeeze the trigger. |
| `f15/f.t13.wav` | إصابة ممتازة. هذا الشغل كله. أنت جاهز للمهمات الحقيقية. | Good kill. That's the whole job. You're ready for the real thing. |
| `f15/f.tmiss.wav` | ما صابت. نعيدها. خلّه ممسوك، واضغط الزناد. | We missed. Let's go again. Keep it tracked, and squeeze the trigger. |
| `f15/f.sa8.wav` | رادار أرضي، سام ثمانية، | Mud spike, SA-8, |
| `f15/f.chaffL.wav` | رقائق! لفّة يسار! | Chaff! Breaking left! |
| `f15/f.chaffR.wav` | رقائق! لفّة يمين! | Chaff! Breaking right! |
| `f15/f.samdown.wav` | سام ثمانية انتهى. | SA-8 is down. |
| `f15/f.alt.15.wav` | نازل لخمسطعش ألف قدم. | Descending to one five thousand. |
| `f15/f.alt.20.wav` | مستوي على عشرين ألف قدم. | Leveling at two zero thousand. |
| `f15/f.alt.25.wav` | صاعد لخمسة وعشرين ألف قدم. | Climbing to two five thousand. |
| `f15/f.fly.wav` | تمام، متوجه للنقطة. | Copy, heading for the point. |
| `f15/f.orbit.wav` | أبدأ المدار. | Setting up the orbit. |
| `f15/f.r.check.15.wav` | الصياد، هنا صقر واحد واحد. في المنطقة، على خمسطعش ألف، جاهز للمهمة، حوّل. | Hunter, Saqr one-one. On station, angels one five, ready for tasking, over. |
| `f15/f.r.check.20.wav` | الصياد، هنا صقر واحد واحد. في المنطقة، على عشرين ألف، جاهز للمهمة، حوّل. | Hunter, Saqr one-one. On station, angels two zero, ready for tasking, over. |
| `f15/f.r.check.25.wav` | الصياد، هنا صقر واحد واحد. في المنطقة، على خمسة وعشرين ألف، جاهز للمهمة، حوّل. | Hunter, Saqr one-one. On station, angels two five, ready for tasking, over. |
| `f15/f.r.ops.15.wav` | العمليات، هنا صقر واحد واحد. في المنطقة، على خمسطعش ألف، جاهز للمهمة، حوّل. | Ops, Saqr one-one. On station, angels one five, ready for tasking, over. |
| `f15/f.r.ops.20.wav` | العمليات، هنا صقر واحد واحد. في المنطقة، على عشرين ألف، جاهز للمهمة، حوّل. | Ops, Saqr one-one. On station, angels two zero, ready for tasking, over. |
| `f15/f.r.ops.25.wav` | العمليات، هنا صقر واحد واحد. في المنطقة، على خمسة وعشرين ألف، جاهز للمهمة، حوّل. | Ops, Saqr one-one. On station, angels two five, ready for tasking, over. |
| `f15/f.r.off.wav` | صقر واحد واحد، طالع. | Saqr one-one, off. |
| `f15/f.clock.1.wav` | على الساعة وحدة! | one o'clock! |
| `f15/f.clock.2.wav` | على الساعة ثنتين! | two o'clock! |
| `f15/f.clock.3.wav` | على الساعة ثلاث! | three o'clock! |
| `f15/f.clock.4.wav` | على الساعة أربع! | four o'clock! |
| `f15/f.clock.5.wav` | على الساعة خمس! | five o'clock! |
| `f15/f.clock.6.wav` | على الساعة ست! | six o'clock! |
| `f15/f.clock.7.wav` | على الساعة سبع! | seven o'clock! |
| `f15/f.clock.8.wav` | على الساعة ثمان! | eight o'clock! |
| `f15/f.clock.9.wav` | على الساعة تسع! | nine o'clock! |
| `f15/f.clock.10.wav` | على الساعة عشر! | ten o'clock! |
| `f15/f.clock.11.wav` | على الساعة احدعش! | eleven o'clock! |
| `f15/f.clock.12.wav` | على الساعة اثنعش! | twelve o'clock! |
| `f15/f.r.in.NORTH.wav` | صقر واحد واحد، داخل من الشمال. | Saqr one-one, in from the north. |
| `f15/f.r.in.NORTHEAST.wav` | صقر واحد واحد، داخل من الشمال الشرقي. | Saqr one-one, in from the northeast. |
| `f15/f.r.in.EAST.wav` | صقر واحد واحد، داخل من الشرق. | Saqr one-one, in from the east. |
| `f15/f.r.in.SOUTHEAST.wav` | صقر واحد واحد، داخل من الجنوب الشرقي. | Saqr one-one, in from the southeast. |
| `f15/f.r.in.SOUTH.wav` | صقر واحد واحد، داخل من الجنوب. | Saqr one-one, in from the south. |
| `f15/f.r.in.SOUTHWEST.wav` | صقر واحد واحد، داخل من الجنوب الغربي. | Saqr one-one, in from the southwest. |
| `f15/f.r.in.WEST.wav` | صقر واحد واحد، داخل من الغرب. | Saqr one-one, in from the west. |
| `f15/f.r.in.NORTHWEST.wav` | صقر واحد واحد، داخل من الشمال الغربي. | Saqr one-one, in from the northwest. |
| `f15/f.tof.10.wav` | زمن السقوط، عشر. | Time of fall, ten. |
| `f15/f.tof.12.wav` | زمن السقوط، اثنعش. | Time of fall, twelve. |
| `f15/f.tof.14.wav` | زمن السقوط، أربعطعش. | Time of fall, fourteen. |
| `f15/f.tof.16.wav` | زمن السقوط، ستطعش. | Time of fall, sixteen. |
| `f15/f.tof.18.wav` | زمن السقوط، ثمنطعش. | Time of fall, eighteen. |
| `f15/f.tof.20.wav` | زمن السقوط، عشرين. | Time of fall, twenty. |
| `f15/f.tof.22.wav` | زمن السقوط، اثنين وعشرين. | Time of fall, twenty-two. |
| `f15/f.tof.24.wav` | زمن السقوط، أربعة وعشرين. | Time of fall, twenty-four. |
| `f15/f.tof.26.wav` | زمن السقوط، ستة وعشرين. | Time of fall, twenty-six. |
| `f15/f.tof.28.wav` | زمن السقوط، ثمانية وعشرين. | Time of fall, twenty-eight. |
| `f15/f.tof.30.wav` | زمن السقوط، ثلاثين. | Time of fall, thirty. |
| `f15/f.tof.32.wav` | زمن السقوط، اثنين وثلاثين. | Time of fall, thirty-two. |
| `f15/f.tof.34.wav` | زمن السقوط، أربعة وثلاثين. | Time of fall, thirty-four. |
| `f15/f.tof.36.wav` | زمن السقوط، ستة وثلاثين. | Time of fall, thirty-six. |
| `f15/f.tof.38.wav` | زمن السقوط، ثمانية وثلاثين. | Time of fall, thirty-eight. |
| `f15/f.tof.40.wav` | زمن السقوط، أربعين. | Time of fall, forty. |
| `f15/f.tof.42.wav` | زمن السقوط، اثنين وأربعين. | Time of fall, forty-two. |
| `f15/f.tof.44.wav` | زمن السقوط، أربعة وأربعين. | Time of fall, forty-four. |
| `f15/f.tof.46.wav` | زمن السقوط، ستة وأربعين. | Time of fall, forty-six. |
| `f15/f.tof.48.wav` | زمن السقوط، ثمانية وأربعين. | Time of fall, forty-eight. |
| `f15/f.tof.50.wav` | زمن السقوط، خمسين. | Time of fall, fifty. |
| `f15/f.tof.52.wav` | زمن السقوط، اثنين وخمسين. | Time of fall, fifty-two. |
| `f15/f.tof.54.wav` | زمن السقوط، أربعة وخمسين. | Time of fall, fifty-four. |
| `f15/f.tof.56.wav` | زمن السقوط، ستة وخمسين. | Time of fall, fifty-six. |
| `f15/f.tof.58.wav` | زمن السقوط، ثمانية وخمسين. | Time of fall, fifty-eight. |
| `f15/f.tof.60.wav` | زمن السقوط، ستين. | Time of fall, sixty. |

### العمليات (8)

| الملف | السطر | بالإنجليزي |
|---|---|---|
| `f15/o.j.check.wav` | صقر واحد واحد، هنا العمليات. توجّه للمنطقة وتواصل مع الصياد. | Saqr one-one, Ops. Proceed to the area and contact Hunter. |
| `f15/o.j.go.wav` | صقر واحد واحد، هنا العمليات. وصلت. الأهداف على وصلة البيانات، ما فيه قوات صديقة بالمنطقة. مصرّح لك بالاشتباك. | Saqr one-one, Ops. Good copy. Targets on your datalink, no friendlies in the area. Cleared to engage. |
| `f15/o.j.rtb.wav` | صقر واحد واحد، هنا العمليات. المهمة انتهت. ارجع للقاعدة، انتهى. | Saqr one-one, Ops. Mission complete. Return to base, out. |
| `f15/o.tst.wav` | صقر واحد واحد، هنا العمليات. هدف طارئ. راجمة صواريخ في الوادي، أولوية. باقي ثلاث دقايق على الإطلاق. الإحداثيات على وصلة البيانات. | Saqr one-one, Ops. Pop-up target. A missile launcher in the valley, priority. Three minutes to launch. Coordinates on your datalink. |
| `f15/o.tst1.wav` | صقر واحد واحد، هنا العمليات. باقي دقيقة على الإطلاق. | Saqr one-one, Ops. One minute to launch. |
| `f15/o.tstfire.wav` | صقر واحد واحد، هنا العمليات. الراجمة أطلقت. | Saqr one-one, Ops. The launcher has fired. |
| `f15/o.ph.TROOPS_IN_CONTACT_AT_THE_WADI_CROSSING.wav` | صقر واحد واحد، هنا العمليات. مهمة جديدة. قواتنا في اشتباك عند عبور الوادي. تواصل مع الصياد. | Saqr one-one, Ops. New tasking. Troops in contact at the wadi crossing. Contact Hunter. |
| `f15/o.ph.POP_UP_LAUNCHER_IN_THE_VALLEY_PRIORITY.wav` | صقر واحد واحد، هنا العمليات. مهمة جديدة. راجمة طارئة في الوادي، أولوية. | Saqr one-one, Ops. New tasking. Pop-up launcher in the valley, priority. |

### صوت التحذير (5)

| الملف | السطر | بالإنجليزي |
|---|---|---|
| `f15/w.alt.wav` | ارتفاع، ارتفاع. | Altitude, altitude. |
| `f15/w.bingo.wav` | الوقود حد الرجعة. | Bingo fuel. |
| `f15/w.overg.wav` | تجاوز الجاذبية. | Over G. |
| `f15/w.fireL.wav` | تحذير. حريق المحرك اليسار. | Warning. Engine fire left. |
| `f15/w.fireR.wav` | تحذير. حريق المحرك اليمين. | Warning. Engine fire right. |
