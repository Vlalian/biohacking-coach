const STRINGS = {
  en: {
    // Navigation
    navCoach:         'Coach',
    navTrainingPlan:  'Training Plan',
    navEquipment:     'Equipment',
    navGlossary:      'Glossary',
    navSettings:      'Settings',
    navPolicy:        'Privacy & Terms',
    // Main coach page buttons
    startWeeklySession: 'Start Weekly Session',
    chatWithCoach:      'Chat with Coach',
    // Conversation / session flow
    confirmSession:     '✓ Confirm Session',
    sendResponse:       'Send Response',
    send:               'Send',
    weekPlanAgreed:     'Week plan agreed',
    weekPlanMessage:    'Your plan is set — check the Training Plan to see your week.',
    agreeWeekPlan:      '✓ Agree week plan',
    endCoachChat:       'End chat',
    // Planning day panel
    planningDayTitle:   'Weekly Planning',
    planningDayDesc:    'Your weekly planning day — time to review the coming week with your Coach.',
    // Migration report notice
    migrationTitle:     'Training data upgraded',
    migrationSummary:   'Your training history was carried over: {sessions} sessions, {ratings} ratings, {skips} skipped, {unavailable} unavailable.',
    migrationDismiss:   'Got it',
    // Calendar expansion
    markUnavailable:    'Mark as unavailable',
    undoUnavailable:    'Undo',
    markSkipped:        'Mark as skipped',
    undoSkipped:        'Undo',
    rateSession:        'Rate this session',
    rateSessionEdit:    'Edit rating',
    discussCoach:       'Discuss with Coach',
    // Status labels
    statusUnavailable:  'Unavailable',
    statusSkipped:      'Skipped',
    statusRest:         'Rest',
    statusPlanned:      'Planned',
    statusCompleted:    'Completed',
    // Feedback modal
    feedbackTitle:      'Session Feedback',
    feedbackSubtitle:   'how did it go?',
    feedbackBodyRpe:    'Body — RPE (1 easy · 10 max)',
    feedbackMindRpe:    'Mind — RPE (1 easy · 10 max)',
    feedbackComment:    'Comment (optional)',
    feedbackCommentPlaceholder: 'Anything worth noting — e.g. carb intake, conditions...',
    feedbackSkip:       'Skip',
    feedbackSave:       'Save',
    // RPE descriptions (index 0 unused, indices 1–10 match RPE value)
    rpeLabels: [
      '',
      'Effortless — barely registered',
      'Very easy — no challenge at all',
      'Easy — light and comfortable',
      'Fairly easy — settling in nicely',
      'Moderate — some effort needed',
      'Somewhat hard — noticeably challenging',
      'Hard — demanding, requires focus',
      'Very hard — pushing your limits',
      'Near maximum — almost nothing left',
      'Absolute maximum — everything given',
    ],
    // Phase narratives (Training Plan)
    phaseNarratives: {
      'Early Base Building': "You're laying the groundwork right now — this phase is all about building your aerobic engine before we ask it to do anything harder. The low-intensity work this week trains your body to burn fat efficiently and builds the structural resilience your tendons and joints need for the months ahead. Don't underestimate easy sessions; this is where the race is won or lost.",
      'Base Building': "We're in the heart of the base phase, which means volume over intensity. Your body is adapting at a cellular level — more mitochondria, better fat oxidation, stronger connective tissue. The tempo sessions this week give us a taste of threshold work while keeping the overall load aerobic. Trust the process: the fitness you're building now is the platform everything else sits on.",
      'Build Phase': "The base is done — now we stress it. This phase introduces real intensity work alongside your endurance sessions, which is where your race-specific fitness develops. The interval sessions this week are targeting your VO2max and lactate threshold directly. You'll feel more tired than in base, and that's the point. Recovery quality matters more now than ever.",
      'Peak Phase': "This is the sharpest point of the blade. We're not adding fitness anymore — we're converting everything you've built into race-ready speed and efficiency. The sessions this week are short, precise, and hard by design. Your job is to hit your zones and trust that the volume is behind you. One or two misses here won't derail anything; one injury will.",
      'Taper': "You've done the work — now we let it settle. Taper is not a rest week; it's a precision week. The reduced volume allows your body to absorb the last training block while your nervous system freshens up. Resist the urge to sneak in extra sessions. The fitness you don't feel right now is still there — it'll show up on race day.",
      'Recovery': "This phase exists for a reason, and that reason is adaptation. Hard training doesn't make you fitter — recovering from hard training does. The easy movement this week keeps blood flowing without adding stress. If you feel sluggish or flat, that's normal and temporary. We come back stronger when we let the body do its job.",
      'Return to Training': "Welcome back. We're rebuilding from wherever you left off, which means holding back more than feels necessary right now. Your cardiovascular system returns faster than your tendons and bones do, so we pace the load carefully to avoid re-injury. The endurance sessions this week are diagnostic as much as physical — we're learning where your body is before we ask more of it.",
      'Off-season Maintenance': "The competitive season is behind you. This phase keeps your engine ticking without burning you out — enough aerobic work to hold your base, not enough to accumulate fatigue. Think of it as staying ready rather than getting ready. Use this time to address any movement quality issues or imbalances before the next build begins.",
    },
    // Settings page
    settingsProfile:      'Profile',
    settingsName:         'Name',
    settingsLanguage:     'Language',
    settingsTargetRace:   'Target race',
    settingsSchedule:     'Schedule',
    settingsPlanDay:      'Weekly planning day',
    settingsConstraints:  'Days you can never train',
    settingsSave:         'Save changes',
    settingsDangerZone:   'Danger zone',
    settingsDangerDesc:   'Clears all your data and returns to onboarding. This cannot be undone.',
    settingsDangerReset:  'Reset all data',
    // Equipment page
    eqRunning:            'Running',
    eqCycling:            'Cycling',
    eqSwimming:           'Swimming',
    eqWearables:          'Wearables',
    eqTrainingShoes:      'Training shoes',
    eqRaceShoes:          'Race shoes',
    eqBikeType:           'Bike type',
    eqBikeModel:          'Brand / model',
    eqHelmet:             'Helmet',
    eqPowerMeter:         'Power meter',
    eqWetsuit:            'Wetsuit',
    eqGoggles:            'Goggles',
    eqGpsWatch:           'GPS watch',
    eqHrMonitor:          'Heart rate monitor',
    eqBikeComputer:       'Bike computer',
    eqNotes:              'Notes',
    eqSave:               'Save equipment',
    eqPlaceholderShoes:   'e.g. Asics Gel-Nimbus 26',
    eqPlaceholderRace:    'e.g. Nike Vaporfly 3',
    eqPlaceholderBike:    'e.g. Road / TT / Mountain',
    eqPlaceholderModel:   'e.g. Canyon Speedmax CF SLX',
    eqPlaceholderHelmet:  'e.g. Giro Aether',
    eqPlaceholderPower:   'e.g. Garmin Rally RS200',
    eqPlaceholderWetsuit: 'e.g. Orca Predator',
    eqPlaceholderGoggles: 'e.g. Speedo Fastskin',
    eqPlaceholderWatch:   'e.g. Garmin Fenix 8',
    eqPlaceholderHr:      'e.g. Polar H10',
    eqPlaceholderComputer:'e.g. Garmin Edge 1040',
    eqPlaceholderNotes:   'Anything else worth noting...',
    // Glossary page
    glossaryTrainingTitle:    'Training Concepts',
    glossarySessionTitle:     'Session Types',
    glossaryRaceTitle:        'Race Terms',
    glossaryTrainingBody: `
      <dl>
        <dt>Zone 2</dt><dd>Low-intensity aerobic effort where you can hold a conversation. The foundation of endurance training — develops fat oxidation and mitochondrial density over time.</dd>
        <dt>VO2max</dt><dd>The maximum rate at which your body can consume oxygen during exercise. A key predictor of endurance performance. Improved by high-intensity interval work.</dd>
        <dt>Lactate threshold</dt><dd>The intensity at which lactic acid accumulates in the blood faster than it can be cleared. Training at and around this zone raises the ceiling of sustainable effort.</dd>
        <dt>FTP (Functional Threshold Power)</dt><dd>The highest average power you can sustain for approximately one hour on the bike. Used to set training zones for cycling.</dd>
        <dt>HRV (Heart Rate Variability)</dt><dd>The variation in time between heartbeats. A higher HRV generally indicates better recovery. Useful for deciding when to push and when to back off.</dd>
        <dt>TSS (Training Stress Score)</dt><dd>A single number representing the training load of a session, combining intensity and duration. Used to track cumulative fatigue and fitness over time.</dd>
        <dt>Aerobic base</dt><dd>The accumulated low-intensity fitness that underlies all other training. A strong base allows higher intensity work to land on a stable foundation.</dd>
        <dt>Periodisation</dt><dd>Structuring training into phases (base, build, peak, taper) so that stress and recovery are deliberately alternated to produce peak performance at the right time.</dd>
      </dl>`,
    glossarySessionBody: `
      <dl>
        <dt>Brick session</dt><dd>A workout combining two disciplines back-to-back — most commonly bike followed immediately by run. Trains your legs to adapt to the transition between disciplines.</dd>
        <dt>Interval</dt><dd>Repeated hard efforts separated by recovery periods. Used to accumulate time at high intensity without excessive fatigue.</dd>
        <dt>Tempo run / ride</dt><dd>A sustained effort at or near lactate threshold. Comfortably hard — you can speak in short sentences, not full paragraphs.</dd>
        <dt>Long slow distance (LSD)</dt><dd>A long session at Zone 2 intensity. Builds aerobic base, fat adaptation, and mental resilience without accumulating excessive fatigue.</dd>
        <dt>Fartlek</dt><dd>Unstructured speed play within an otherwise easy session. Short bursts of effort at your own discretion — useful for breaking monotony while adding stimulus.</dd>
        <dt>Recovery session</dt><dd>A very easy, short effort designed to promote blood flow and aid recovery without adding meaningful training stress.</dd>
        <dt>Open-water swim</dt><dd>A swim in natural water (lake, sea, river) as opposed to a pool. Involves sighting, drafting, and wetsuit adaptation — all race-specific skills.</dd>
      </dl>`,
    glossaryRaceBody: `
      <dl>
        <dt>T1 / T2</dt><dd>Transition zones. T1 is swim-to-bike; T2 is bike-to-run. Practice makes transitions faster and less stressful on race day.</dd>
        <dt>AG (Age group)</dt><dd>Your competitive category based on age, typically in 5-year bands. Most amateur triathletes compete in their AG rather than outright.</dd>
        <dt>Wetsuit legal</dt><dd>Water temperature is below the cutoff (typically 24.5°C / 76°F for non-elites) where wetsuits are permitted in competition.</dd>
        <dt>DNF / DNS / DQ</dt><dd>Did Not Finish / Did Not Start / Disqualified. Common race outcomes beyond a finish. A DNS is sometimes the smartest choice when injured.</dd>
        <dt>Drafting</dt><dd>Swimming or cycling close behind another athlete to reduce drag. Legal in swim, banned on the bike in most amateur races, legal on the run.</dd>
        <dt>Special needs</dt><dd>A bag you can collect mid-race (usually mid-bike and mid-run) containing extra nutrition, a spare kit item, or anything you need for the second half.</dd>
        <dt>Ironman distance</dt><dd>3.8 km swim · 180 km bike · 42.2 km run. The full-distance triathlon. Also contested as 70.3 (half-iron): 1.9 km swim · 90 km bike · 21.1 km run.</dd>
      </dl>`,
    // Policy page
    policyPrivacyTitle:   'Privacy Policy',
    policyTermsTitle:     'Terms of Use',
    policyPrivacyBody: `<p style="margin:0 0 12px;"><strong style="color:var(--text);">What we collect</strong><br>Your training profile (name, race target, schedule preferences), session feedback, and week plans are stored locally on your device. No data is sent to external servers except your conversation messages, which are processed by the Anthropic Claude API to generate coaching responses.</p><p style="margin:0 0 12px;"><strong style="color:var(--text);">How we use it</strong><br>All data is used solely to provide personalised coaching responses. Your profile data is included in API requests to give the coach context about your training.</p><p style="margin:0 0 12px;"><strong style="color:var(--text);">Data storage</strong><br>All app data is stored in your browser's localStorage and remains on your device. Clearing your browser data or using "Reset all data" in Settings will permanently delete it.</p><p style="margin:0;"><strong style="color:var(--text);">Third parties</strong><br>Coaching responses are generated via the Anthropic API. Anthropic's privacy policy applies to those requests. No other third parties receive your data.</p>`,
    policyTermsBody: `<p style="margin:0 0 12px;"><strong style="color:var(--text);">POC disclaimer</strong><br>This is a proof-of-concept application. Coaching suggestions are AI-generated and should not replace advice from a qualified coach or medical professional.</p><p style="margin:0 0 12px;"><strong style="color:var(--text);">No liability</strong><br>Use this app at your own risk. The developers accept no liability for training outcomes, injury, or decisions made based on the app's suggestions.</p><p style="margin:0;"><strong style="color:var(--text);">Acceptable use</strong><br>This app is intended for personal training support only. Do not attempt to misuse the AI coaching interface or extract data beyond its intended purpose.</p>`,
    // Conversation UI labels and placeholders
    sessionNegotiationLabel: 'Session Negotiation',
    weeklySessionLabel:      'Weekly Session',
    coachChatLabel:          'Coach Chat',
    pushbackPlaceholder:     'Push back, ask a question, or propose something different... (Enter to send)',
    weeklyPlaceholder:       'Respond to your Coach, flag constraints, or push back on the plan...',
    chatPlaceholder:         'Ask your Coach anything about training, nutrition, equipment, or your week...',
    // Coach loading
    coachThinking:      'Coach is thinking...',
    // Calendar day/month labels
    dow: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    months: ['January', 'February', 'March', 'April', 'May', 'June',
             'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    // Onboarding MCQ
    mcqStep:            'Step',
    mcqOf:              'of',
    mcqName:            'What should we call you?',
    mcqNamePlaceholder: 'Your name',
    mcqLanguage:        'Which language do you prefer?',
    mcqExperience:      'How many Ironman-distance races have you completed?',
    mcqExperienceSub:   'Including 70.3 and full-distance finishes',
    mcqExpOpt1:         'This will be my first',
    mcqExpOpt2:         '2–4 races',
    mcqExpOpt3:         '5 or more',
    mcqRace:            "What's your target race?",
    mcqRaceSub:         'Include the name and approximate date',
    mcqRacePlaceholder: 'e.g. Ironman Copenhagen, June 2026',
    mcqAboutYou:        'A bit more about you',
    mcqSportBg:         'Sport background',
    mcqWeeklyHours:     'Weekly training hours',
    mcqMotivation:      'Main motivation',
    mcqBestTime:        'Best Ironman finish time',
    mcqBestTimePlaceholder: 'e.g. 11:30',
    mcqWeakest:         'Weakest discipline',
    mcqHumanCoach:      'Working with a human coach?',
    mcqTargetTime:      'Target finish time',
    mcqTargetTimePlaceholder: 'e.g. 10:45',
    mcqMetrics:         'What do you track?',
    mcqOptional:        '(optional)',
    mcqOptionalMulti:   '(optional — select all that apply)',
    mcqGarminTitle:     'Upload your training history',
    mcqGarminSub:       '.fit or .gpx files from Garmin, Wahoo, or compatible devices — up to 20 files, 6 months history',
    mcqGarminChoose:    'Choose files…',
    mcqGarminSkip:      'Skip for now',
    mcqConstraintsTitle:'Any days you can never train?',
    mcqConstraintsSub:  'Optional — select all that apply',
    mcqWeeklyDayTitle:  'Weekly planning day',
    mcqWeeklyDaySub:    'When do you typically review your week?',
    mcqContinue:        'Continue →',
    mcqCompleteSetup:   'Complete setup →',
    mcqStartTraining:   'Start training →',
    mcqProfileSet:      'Profile set — welcome to your programme',
    // Adaptive options
    optRunner:          'Runner', optCyclist: 'Cyclist', optSwimmer: 'Swimmer', optGym: 'Gym', optNone: 'None',
    optUnder3:          'Under 3h', opt36:    '3–6h', opt610: '6–10h', opt10plus: '10h+',
    optCompletion:      'Completion', optChallenge: 'Personal challenge', optCommunity: 'Community', optPerformance: 'Performance',
    optSwim:            'Swim', optBike: 'Bike', optRun: 'Run', optEqual: 'Equal',
    optYes:             'Yes', optNo: 'No',
    optHR:              'Heart Rate', optPower: 'Power', optHRV: 'HRV', optPace: 'Pace',
    optFlexible:        'Flexible',
  },

  da: {
    // Navigation
    navCoach:         'Coach',
    navTrainingPlan:  'Træningsplan',
    navEquipment:     'Udstyr',
    navGlossary:      'Ordbog',
    navSettings:      'Indstillinger',
    navPolicy:        'Privatliv & Vilkår',
    // Main coach page buttons
    startWeeklySession: 'Start ugentlig session',
    chatWithCoach:      'Chat med Coach',
    // Conversation / session flow
    confirmSession:     '✓ Bekræft session',
    sendResponse:       'Send svar',
    send:               'Send',
    weekPlanAgreed:     'Ugeplan aftalt',
    weekPlanMessage:    'Din plan er klar — tjek Træningsplanen for at se din uge.',
    agreeWeekPlan:      '✓ Godkend ugeplan',
    endCoachChat:       'Afslut chat',
    // Planning day panel
    planningDayTitle:   'Ugentlig planlægning',
    planningDayDesc:    'Din ugentlige plandag — tid til at gennemgå den kommende uge med din coach.',
    // Migration report notice
    migrationTitle:     'Træningsdata opgraderet',
    migrationSummary:   'Din træningshistorik er overført: {sessions} sessioner, {ratings} vurderinger, {skips} sprunget over, {unavailable} utilgængelige.',
    migrationDismiss:   'Forstået',
    // Calendar expansion
    markUnavailable:    'Marker som utilgængelig',
    undoUnavailable:    'Fortryd',
    markSkipped:        'Marker som sprunget over',
    undoSkipped:        'Fortryd',
    rateSession:        'Vurder denne session',
    rateSessionEdit:    'Evaluer',
    discussCoach:       'Snak med Coach',
    // Status labels
    statusUnavailable:  'Utilgængelig',
    statusSkipped:      'Sprunget over',
    statusRest:         'Hvile',
    statusPlanned:      'Planlagt',
    statusCompleted:    'Gennemført',
    // Feedback modal
    feedbackTitle:      'Session feedback',
    feedbackSubtitle:   'hvordan gik det?',
    feedbackBodyRpe:    'Krop — RPE (1 let · 10 max)',
    feedbackMindRpe:    'Hoved — RPE (1 let · 10 max)',
    feedbackComment:    'Kommentar (valgfri)',
    feedbackCommentPlaceholder: 'Noget værd at notere — f.eks. kulhydratindtag, forhold...',
    feedbackSkip:       'Spring over',
    feedbackSave:       'Gem',
    // RPE descriptions
    rpeLabels: [
      '',
      'Ingen anstrengelse — knapt mærkbar',
      'Meget let — ingen udfordring overhovedet',
      'Let — let og behagelig',
      'Rimeligt let — falder godt ind',
      'Moderat — kræver en smule indsats',
      'Lidt hård — mærkbart udfordrende',
      'Hård — krævende, kræver fokus',
      'Meget hård — presser dine grænser',
      'Næsten maksimum — næsten ingenting tilbage',
      'Absolut maksimum — alt givet',
    ],
    // Phase narratives (Training Plan)
    phaseNarratives: {
      'Early Base Building': "Du lægger fundamentet lige nu — denne fase handler om at opbygge din aerobe motor, før vi beder den om at gøre noget hårdere. Det lavintensitetsarbejde denne uge træner din krop til effektivt at forbrænde fedt og opbygger den strukturelle robusthed, som dine sener og led har brug for i de kommende måneder. Undervurder ikke lette sessioner; det er her løbet vindes eller tabes.",
      'Base Building': "Vi er i hjertet af basefasen, hvilket betyder volumen frem for intensitet. Din krop tilpasser sig på celleniveau — flere mitokondrier, bedre fedtoxidation, stærkere bindevæv. Temposessionerne denne uge giver os et glimt af tærskelarbejde, mens den samlede belastning holdes aerob. Stol på processen: den form, du opbygger nu, er platformen alt andet hviler på.",
      'Build Phase': "Basen er lagt — nu stresser vi den. Denne fase introducerer intenst arbejde ved siden af udholdenhedssessionerne, og det er her din racespecifikke form udvikles. Intervalsessionerne denne uge retter sig direkte mod din VO2max og laktatgrænse. Du vil føle dig mere træt end i basen, og det er meningen. Restitutionskvalitet er vigtigere nu end nogensinde.",
      'Peak Phase': "Dette er bladets skarpeste punkt. Vi tilføjer ikke mere form — vi konverterer alt, hvad du har opbygget, til racepaarat hastighed og effektivitet. Sessionerne denne uge er korte, præcise og hårde med vilje. Din opgave er at ramme dine zoner og stole på, at voluminet er bag dig. En eller to misser her ødelægger ikke noget; én skade vil.",
      'Taper': "Du har gjort arbejdet — nu lader vi det sætte sig. Taper er ikke en hvileuge; det er en præcisionsuge. Det reducerede volumen giver din krop lov til at absorbere den seneste træningsblok, mens dit nervesystem bliver friskere. Modstå trangen til at snige ekstra sessioner ind. Den form, du ikke kan mærke nu, er stadig der — den dukker op på løbsdagen.",
      'Recovery': "Denne fase eksisterer af en grund, og den grund er tilpasning. Hård træning gør dig ikke bedre — det gør restitution fra hård træning. Den lette bevægelse denne uge holder blodgennemstrømningen i gang uden at tilføje stress. Hvis du føler dig sløv eller flad, er det normalt og midlertidigt. Vi kommer stærkere tilbage, når vi lader kroppen gøre sit arbejde.",
      'Return to Training': "Velkommen tilbage. Vi genopbygger fra det sted, du slap, hvilket betyder at holde igen mere end det føles nødvendigt nu. Dit kardiovaskulære system vender tilbage hurtigere end dine sener og knogler, så vi doserer belastningen omhyggeligt for at undgå genopblussen. Udholdenhedssessionerne denne uge er diagnostiske ligesom fysiske — vi lærer, hvor din krop er, før vi beder om mere.",
      'Off-season Maintenance': "Den konkurrenceprægede sæson er bag dig. Denne fase holder din motor i gang uden at udbrænde dig — nok aerobt arbejde til at holde din base, ikke nok til at akkumulere træthed. Tænk på det som at forblive klar frem for at blive klar. Brug denne tid til at adressere eventuelle bevægevanskeligheder eller ubalancer, inden den næste opbygning begynder.",
    },
    // Settings page
    settingsProfile:      'Profil',
    settingsName:         'Navn',
    settingsLanguage:     'Sprog',
    settingsTargetRace:   'Målløb',
    settingsSchedule:     'Program',
    settingsPlanDay:      'Ugentlig planlægningsdag',
    settingsConstraints:  'Dage du aldrig kan træne',
    settingsSave:         'Gem ændringer',
    settingsDangerZone:   'Farezonen',
    settingsDangerDesc:   'Sletter alle dine data og vender tilbage til opsætning. Dette kan ikke fortrydes.',
    settingsDangerReset:  'Nulstil alle data',
    // Equipment page
    eqRunning:            'Løb',
    eqCycling:            'Cykling',
    eqSwimming:           'Svømning',
    eqWearables:          'Gadgets',
    eqTrainingShoes:      'Træningssko',
    eqRaceShoes:          'Løbssko',
    eqBikeType:           'Cykeltype',
    eqBikeModel:          'Mærke / model',
    eqHelmet:             'Hjelm',
    eqPowerMeter:         'Wattmåler',
    eqWetsuit:            'Våddragt',
    eqGoggles:            'Svømmebriller',
    eqGpsWatch:           'GPS-ur',
    eqHrMonitor:          'Pulsmåler',
    eqBikeComputer:       'Cykelcomputer',
    eqNotes:              'Noter',
    eqSave:               'Gem udstyr',
    eqPlaceholderShoes:   'f.eks. Asics Gel-Nimbus 26',
    eqPlaceholderRace:    'f.eks. Nike Vaporfly 3',
    eqPlaceholderBike:    'f.eks. Landevej / TT / MTB',
    eqPlaceholderModel:   'f.eks. Canyon Speedmax CF SLX',
    eqPlaceholderHelmet:  'f.eks. Giro Aether',
    eqPlaceholderPower:   'f.eks. Garmin Rally RS200',
    eqPlaceholderWetsuit: 'f.eks. Orca Predator',
    eqPlaceholderGoggles: 'f.eks. Speedo Fastskin',
    eqPlaceholderWatch:   'f.eks. Garmin Fenix 8',
    eqPlaceholderHr:      'f.eks. Polar H10',
    eqPlaceholderComputer:'f.eks. Garmin Edge 1040',
    eqPlaceholderNotes:   'Andet værd at notere...',
    // Glossary page
    glossaryTrainingTitle:    'Træningsbegreber',
    glossarySessionTitle:     'Sessionstyper',
    glossaryRaceTitle:        'Løbstermer',
    glossaryTrainingBody: `
      <dl>
        <dt>Zone 2</dt><dd>Lav aerob intensitet, hvor du kan holde en samtale. Grundlaget for udholdenhedstræning — udvikler fedtoxidation og mitokondrier over tid.</dd>
        <dt>VO2max</dt><dd>Den maksimale mængde ilt din krop kan forbruge under træning. En vigtig forudsigelse af udholdenhedspræstation. Forbedres ved høj-intensitets intervaltræning.</dd>
        <dt>Laktatgrænse</dt><dd>Den intensitet, hvor mælkesyre akkumuleres hurtigere end den kan fjernes. Træning ved og omkring denne zone hæver loftet for bæredygtig indsats.</dd>
        <dt>FTP (Funktionel tærskeleffekt)</dt><dd>Den højeste gennemsnitlige watt, du kan opretholde i ca. en time på cyklen. Bruges til at sætte træningszoner for cykling.</dd>
        <dt>HRV (Pulsvariabilitet)</dt><dd>Variationen i tid mellem hjerteslag. Højere HRV indikerer generelt bedre restitution. Nyttigt til at bestemme, hvornår man skal presse på og hvornår man skal bakke af.</dd>
        <dt>TSS (Træningsbelastningsscore)</dt><dd>Et enkelt tal der repræsenterer træningsbelastningen i en session, der kombinerer intensitet og varighed. Bruges til at spore kumulativ træthed og form over tid.</dd>
        <dt>Aerob base</dt><dd>Den akkumulerede lavintensitetskondition, der underbygger al anden træning. En stærk base giver intenst arbejde et stabilt fundament at lande på.</dd>
        <dt>Periodisering</dt><dd>Strukturering af træning i faser (base, opbygning, top, nedtrapning) så stress og restitution bevidst alterneres for at producere toppræstation på det rette tidspunkt.</dd>
      </dl>`,
    glossarySessionBody: `
      <dl>
        <dt>Brick-session</dt><dd>En træning der kombinerer to discipliner i forlængelse af hinanden — oftest cykel efterfulgt umiddelbart af løb. Træner benene i at tilpasse sig overgangen mellem discipliner.</dd>
        <dt>Interval</dt><dd>Gentagne hårde indsatser adskilt af restitutionsperioder. Bruges til at akkumulere tid ved høj intensitet uden overdreven træthed.</dd>
        <dt>Tempo løb / tur</dt><dd>En vedvarende indsats ved eller nær laktatgrænsen. Komfortabelt hårdt — du kan tale i korte sætninger, ikke hele afsnit.</dd>
        <dt>Lang langsom distance (LSD)</dt><dd>En lang session ved Zone 2-intensitet. Opbygger aerob base, fedttilpasning og mental robusthed uden at akkumulere overdreven træthed.</dd>
        <dt>Fartlek</dt><dd>Ustruktureret hastighedsleg inden for en ellers let session. Korte intensitetsudbrud efter eget skøn — nyttigt til at bryde monotonien og tilføje stimulus.</dd>
        <dt>Restitutionssession</dt><dd>En meget let, kort indsats designet til at fremme blodgennemstrømning og hjælpe restitution uden at tilføje meningsfuld træningsbelastning.</dd>
        <dt>Åbentvandssvøm</dt><dd>En svømmetur i naturligt vand (sø, hav, å) i modsætning til en pool. Involverer sigtning, udkast og våddragt-tilpasning — alle racespecifikke færdigheder.</dd>
      </dl>`,
    glossaryRaceBody: `
      <dl>
        <dt>T1 / T2</dt><dd>Skiftezoner. T1 er svøm-til-cykel; T2 er cykel-til-løb. Øvelse gør transitioner hurtigere og mindre stressende på løbsdagen.</dd>
        <dt>AG (Aldersgruppe)</dt><dd>Din konkurrencekategori baseret på alder, typisk i 5-årige bånd. De fleste amatørtriatleter konkurrerer i deres AG frem for samlet.</dd>
        <dt>Våddragt tilladt</dt><dd>Vandtemperaturen er under grænsen (typisk 24,5°C for ikke-eliter), hvor våddragter er tilladt i konkurrence.</dd>
        <dt>DNF / DNS / DQ</dt><dd>Did Not Finish / Did Not Start / Diskvalificeret. Almindelige løbsudfald ud over en gennemførelse. DNS er nogle gange det klogeste valg ved skade.</dd>
        <dt>Udkast</dt><dd>At svømme eller cykle tæt bag en anden atlet for at reducere modstand. Tilladt ved svømning, forbudt på cyklen i de fleste amatørløb, tilladt ved løb.</dd>
        <dt>Særlige behov</dt><dd>En taske du kan hente midt i løbet (normalt midt på cykel- og løbsdelen) med ekstra ernæring, et ekstra udstyrsstykke eller hvad du har brug for til anden halvdel.</dd>
        <dt>Ironman-distance</dt><dd>3,8 km svøm · 180 km cykel · 42,2 km løb. Fuld-distance triatlon. Også afholdt som 70.3 (halv-iron): 1,9 km svøm · 90 km cykel · 21,1 km løb.</dd>
      </dl>`,
    // Policy page
    policyPrivacyTitle:   'Privatlivspolitik',
    policyTermsTitle:     'Vilkår for brug',
    policyPrivacyBody: `<p style="margin:0 0 12px;"><strong style="color:var(--text);">Hvad vi indsamler</strong><br>Din træningsprofil (navn, løbsmål, programpræferencer), sessionsfeedback og ugeplaner gemmes lokalt på din enhed. Ingen data sendes til eksterne servere undtagen dine samtalebeskeder, som behandles af Anthropic Claude API for at generere coachingsvar.</p><p style="margin:0 0 12px;"><strong style="color:var(--text);">Hvordan vi bruger det</strong><br>Alle data bruges udelukkende til at give personlige coachingsvar. Dine profildata inkluderes i API-anmodninger for at give coachen kontekst om din træning.</p><p style="margin:0 0 12px;"><strong style="color:var(--text);">Datalagring</strong><br>Alle app-data gemmes i din browsers localStorage og forbliver på din enhed. Rydning af browserdata eller brug af "Nulstil alle data" i Indstillinger vil slette dem permanent.</p><p style="margin:0;"><strong style="color:var(--text);">Tredjeparts</strong><br>Coachingsvar genereres via Anthropic API. Anthropics privatlivspolitik gælder for disse anmodninger. Ingen andre tredjeparter modtager dine data.</p>`,
    policyTermsBody: `<p style="margin:0 0 12px;"><strong style="color:var(--text);">POC-ansvarsfraskrivelse</strong><br>Dette er en proof-of-concept applikation. Coachingforslag er AI-genererede og bør ikke erstatte rådgivning fra en kvalificeret coach eller læge.</p><p style="margin:0 0 12px;"><strong style="color:var(--text);">Intet ansvar</strong><br>Brug denne app på eget ansvar. Udviklerne påtager sig intet ansvar for træningsresultater, skader eller beslutninger truffet på baggrund af appens forslag.</p><p style="margin:0;"><strong style="color:var(--text);">Acceptabel brug</strong><br>Denne app er udelukkende beregnet til personlig træningsstøtte. Forsøg ikke at misbruge AI-coachinggrænsefladen eller udtrække data ud over det tilsigtede formål.</p>`,
    // Conversation UI labels and placeholders
    sessionNegotiationLabel: 'Session forhandling',
    weeklySessionLabel:      'Ugentlig session',
    coachChatLabel:          'Coach chat',
    pushbackPlaceholder:     'Skub tilbage, stil et spørgsmål, eller foreslå noget andet... (Enter for at sende)',
    weeklyPlaceholder:       'Svar din coach, markér begrænsninger, eller skub tilbage på planen...',
    chatPlaceholder:         'Spørg din coach om alt vedr. træning, ernæring, udstyr eller din uge...',
    // Coach loading
    coachThinking:      'Coach tænker...',
    // Calendar day/month labels
    dow: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'],
    months: ['Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni',
             'Juli', 'August', 'September', 'Oktober', 'November', 'December'],
    days: ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'],
    // Onboarding MCQ
    mcqStep:            'Trin',
    mcqOf:              'af',
    mcqName:            'Hvad skal vi kalde dig?',
    mcqNamePlaceholder: 'Dit navn',
    mcqLanguage:        'Hvilket sprog foretrækker du?',
    mcqExperience:      'Hvor mange Ironman-distanceløb har du gennemført?',
    mcqExperienceSub:   'Inkl. 70.3 og fuld distance',
    mcqExpOpt1:         'Det bliver mit første',
    mcqExpOpt2:         '2–4 løb',
    mcqExpOpt3:         '5 eller flere',
    mcqRace:            'Hvad er dit målløb?',
    mcqRaceSub:         'Skriv navn og omtrentlig dato',
    mcqRacePlaceholder: 'f.eks. Ironman Copenhagen, juni 2026',
    mcqAboutYou:        'Lidt mere om dig',
    mcqSportBg:         'Sport baggrund',
    mcqWeeklyHours:     'Ugentlige træningstimer',
    mcqMotivation:      'Primær motivation',
    mcqBestTime:        'Bedste Ironman-sluttid',
    mcqBestTimePlaceholder: 'f.eks. 11:30',
    mcqWeakest:         'Svageste disciplin',
    mcqHumanCoach:      'Arbejder du med en menneskelig coach?',
    mcqTargetTime:      'Målsluttid',
    mcqTargetTimePlaceholder: 'f.eks. 10:45',
    mcqMetrics:         'Hvad tracker du?',
    mcqOptional:        '(valgfri)',
    mcqOptionalMulti:   '(valgfri — vælg alle der passer)',
    mcqGarminTitle:     'Upload din træningshistorik',
    mcqGarminSub:       '.fit eller .gpx-filer fra Garmin, Wahoo eller kompatible enheder — op til 20 filer, 6 måneders historik',
    mcqGarminChoose:    'Vælg filer…',
    mcqGarminSkip:      'Spring over for nu',
    mcqConstraintsTitle:'Er der dage, du aldrig kan træne?',
    mcqConstraintsSub:  'Valgfri — vælg alle der passer',
    mcqWeeklyDayTitle:  'Ugentlig planlægningsdag',
    mcqWeeklyDaySub:    'Hvornår gennemgår du typisk din uge?',
    mcqContinue:        'Fortsæt →',
    mcqCompleteSetup:   'Fuldfør opsætning →',
    mcqStartTraining:   'Start træning →',
    mcqProfileSet:      'Profil oprettet — velkommen til dit program',
    // Adaptive options
    optRunner:     'Løber', optCyclist: 'Cyklist', optSwimmer: 'Svømmer', optGym: 'Fitness', optNone: 'Ingen',
    optUnder3:     'Under 3t', opt36: '3–6t', opt610: '6–10t', opt10plus: '10t+',
    optCompletion: 'Gennemførelse', optChallenge: 'Personlig udfordring', optCommunity: 'Fællesskab', optPerformance: 'Præstation',
    optSwim:       'Svøm', optBike: 'Cykel', optRun: 'Løb', optEqual: 'Lige',
    optYes:        'Ja', optNo: 'Nej',
    optHR:         'Puls', optPower: 'Watt', optHRV: 'HRV', optPace: 'Pace',
    optFlexible:   'Fleksibel',
  },
};

export function t(key) {
  const lang = (window._language === 'Dansk' || localStorage.getItem('bca_language') === 'Dansk') ? 'da' : 'en';
  const val  = STRINGS[lang]?.[key] ?? STRINGS.en[key];
  return val !== undefined ? val : key;
}

export function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}
