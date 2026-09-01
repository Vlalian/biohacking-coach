import { isAdmissible } from './licence';

/**
 * The corpus register, as data.
 *
 * `.scratch/knowledge-oracle/corpus.md` is the decision record — prose, and
 * gitignored, so the ingest script cannot read a verdict out of it. Issue 02
 * requires that a source marked **out** "cannot be ingested — the script refuses
 * it rather than trusting the caller", which means the register's verdicts have
 * to exist as data the code can check. This file is that.
 *
 * Two rules govern how it is maintained:
 *
 * 1. **OUT rows are retained, not deleted.** An out source is refused *by name*
 *    (see `admit`), which is stronger than being refused by absence: absence
 *    cannot tell "we decided against this" apart from "nobody has looked at it
 *    yet", and only the first is a decision.
 * 2. **`licence` records what was actually read**, never what the publisher is
 *    assumed to do. `concurrent-training-sequence-2023` is CC BY with no version
 *    because neither the article page nor the journal policy states one. Recorded
 *    as found, not as tidied.
 *
 *    On 2026-08-27 the two rows that had defeated automated fetching were read by
 *    hand, and they are the argument for this rule in both directions:
 *    `block-periodization-2019` is CC BY-NC 3.0, exactly the guess the note here
 *    refused to record, while `openstax-anatomy-physiology-2e` is CC BY-NC-SA,
 *    where the guess had been plain CC BY. One assumption right, one wrong, and
 *    no way to tell which without looking. Both now fail the rule and are closed.
 *
 * ## The 2026-08-28 licence audit
 *
 * Every admitted row was checked twice more, because 32 of them had been cleared
 * from a PMC page alone — the evidence the JSSM row proved unreliable.
 *
 * 1. **Crossref metadata**, via OpenAlex, keyed on DOI. Publisher-deposited, so
 *    it can genuinely disagree with PMC. Thirty-three agreed; one did not, and
 *    `low-energy-availability-bone-2025` carries that story.
 * 2. **The publishers' own JATS deposits** — the cached XML each source was
 *    ingested from. Its `<permissions>` block is the licence the publisher
 *    wrote, not a third party's summary of it: a machine-readable
 *    `creativecommons.org/licenses/by/4.0/` plus the article's own Open Access
 *    paragraph. **All 34 carry one. None is NC, ND or SA. None is missing.**
 *
 * That second check is the strongest evidence available without reading 34
 * publisher pages by hand, and it is worth preferring over aggregators: a
 * missing `<permissions>` block is exactly what the JSSM article looked like,
 * so the check fails loudly in the case that actually bit us. It is also free
 * and local — re-run it against `.corpus-cache/` whenever the corpus grows.
 *
 * The register goes stale — licences change, articles move publisher. The IN rows
 * were true on 2026-08-19 and re-verified 2026-08-28; the two OUT rows above were
 * re-read 2026-08-27. Re-read `corpus.md` before any new ingestion run and treat
 * every row here as a hypothesis with a URL attached, exactly as `AGENTS.md` says
 * to treat a document's claim about the code.
 */

/** Why a source is out. Recorded so a refusal can say something useful. */
export type OutReason =
  | 'licence-restrictive'
  | 'licence-unestablished'
  | 'commercial';

export interface CorpusSource {
  /** Stable key. The ingest script and the cache directory both use it. */
  slug: string;
  title: string;
  /** Rendered as they appear in the citation, not normalised. */
  authors: string;
  year: number;
  /** Canonical DOI, without the resolver prefix. Empty when the source has none. */
  doi: string;
  /** PMC identifier — how the fetch pass reaches full text. Null when out. */
  pmcid: string | null;
  /** The licence as read on `licenceUrl`. Empty when it could not be read. */
  licence: string;
  /** Where the licence statement was actually read. */
  licenceUrl: string;
  /**
   * The attribution CC BY requires, ready to display beside a retrieved passage.
   * Stored on the source row at ingest so a citation never has to be assembled
   * from a document nobody can open.
   */
  attribution: string;
  /** What training-science ground this source covers. */
  territory: string;
  verdict: 'in' | 'out';
  /** One line: why it is in, or why it is out. */
  reason: string;
  outReason?: OutReason;
}

/**
 * Every source the register has ruled on, in and out alike.
 *
 * Not a corpus source and deliberately absent: WebDevSimplified's RAG repository,
 * a pattern reference for pipeline shape only (no licence file, never copied). It
 * is named in `corpus.md` so nobody mistakes it for content; it is not listed here
 * because it was never a candidate.
 */
export const CORPUS: readonly CorpusSource[] = [
  {
    slug: 'taper-meta-analysis-2023',
    title:
      'Effects of tapering on performance in endurance athletes: a systematic review and meta-analysis',
    authors: 'Wang Z, Wang YT, Gao W, Zhong Y',
    year: 2023,
    doi: '10.1371/journal.pone.0282838',
    pmcid: 'PMC10171681',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/',
    attribution:
      'Wang Z, Wang YT, Gao W, Zhong Y (2023). Effects of tapering on performance in endurance athletes: a systematic review and meta-analysis. PLOS ONE. Licensed CC BY 4.0.',
    territory:
      'taper — duration, volume reduction, whether intensity is maintained',
    verdict: 'in',
    reason:
      'The direct answer to "why does the taper look like this?", and a meta-analysis rather than one study.',
  },
  {
    slug: 'intensity-distribution-review-2024',
    title:
      'The Effect of Polarized Training Intensity Distribution on Maximal Oxygen Uptake and Work Economy Among Endurance Athletes: A Systematic Review',
    authors: 'Nost HL, Aune MA, van den Tillaar R',
    year: 2024,
    doi: '10.3390/sports12120326',
    pmcid: 'PMC11679080',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11679080/',
    attribution:
      'Nost HL, Aune MA, van den Tillaar R (2024). The Effect of Polarized Training Intensity Distribution on Maximal Oxygen Uptake and Work Economy Among Endurance Athletes: A Systematic Review. Sports 12(12):326. Licensed CC BY 4.0.',
    territory: 'how hard, how often — the 80/20 question',
    verdict: 'in',
    reason:
      'The science under "why is this week mostly easy?", the question a plan generator answers worst.',
  },
  {
    slug: 'triathlon-readiness-2019',
    title: 'Training and Competition Readiness in Triathlon',
    authors: 'Etxebarria N, Mujika I, Pyne DB',
    year: 2019,
    doi: '10.3390/sports7050101',
    pmcid: 'PMC6571715',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6571715/',
    attribution:
      'Etxebarria N, Mujika I, Pyne DB (2019). Training and Competition Readiness in Triathlon. Sports 7(5):101. Licensed CC BY 4.0.',
    territory:
      'three disciplines in one week, brick sessions, illness and injury risk at high volume',
    verdict: 'in',
    reason:
      'The only source written about triathletes rather than endurance athletes in general.',
  },
  {
    slug: 'overtraining-cognition-2023',
    title:
      'Impact of Overtraining on Cognitive Function in Endurance Athletes: A Systematic Review',
    authors: 'Symons IK, Bruce L, Main LC',
    year: 2023,
    doi: '10.1186/s40798-023-00614-3',
    pmcid: 'PMC10409951',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10409951/',
    attribution:
      'Symons IK, Bruce L, Main LC (2023). Impact of Overtraining on Cognitive Function in Endurance Athletes: A Systematic Review. Sports Medicine - Open 9:69. Licensed CC BY 4.0.',
    territory:
      'functional overreaching vs non-functional overreaching vs overtraining syndrome; the mental side of load',
    verdict: 'in',
    reason:
      'Mind Feedback is the product’s stated differentiator, and this connects a mental signal to a load state.',
  },
  {
    slug: 'nutrient-timing-position-stand-2017',
    title:
      'International Society of Sports Nutrition position stand: nutrient timing',
    authors: 'Kerksick CM, Arent S, Schoenfeld BJ, et al.',
    year: 2017,
    doi: '10.1186/s12970-017-0189-4',
    pmcid: 'PMC5596471',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/',
    attribution:
      'Kerksick CM, Arent S, Schoenfeld BJ, et al. (2017). International Society of Sports Nutrition position stand: nutrient timing. Journal of the International Society of Sports Nutrition 14:33. Licensed CC BY 4.0; data under CC0 1.0.',
    territory:
      'what to eat and when around sessions; carbohydrate rates, protein timing',
    verdict: 'in',
    reason:
      'A position stand is the closest this field has to a settled answer, and it answers a question the Coach actually gets.',
  },
  {
    slug: 'carbohydrate-horizons-2022',
    title:
      'New Horizons in Carbohydrate Research and Application for Endurance Athletes',
    authors: 'Podlogar T, Wallis GA',
    year: 2022,
    doi: '10.1007/s40279-022-01757-1',
    pmcid: 'PMC9734239',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9734239/',
    attribution:
      'Podlogar T, Wallis GA (2022). New Horizons in Carbohydrate Research and Application for Endurance Athletes. Sports Medicine 52(Suppl 1):5-23. Licensed CC BY 4.0.',
    territory:
      'carbohydrate rates during long efforts, multiple transportable carbohydrates, Ironman-length fuelling',
    verdict: 'in',
    reason:
      'The 2017 position stand’s rates have moved; retrieval returning only the older one would give 2017’s numbers.',
  },
  {
    slug: 'gut-training-2023',
    title:
      'The Effect of Gut-Training and Feeding-Challenge on Markers of Gastrointestinal Status in Response to Endurance Exercise: A Systematic Literature Review',
    authors: 'Martinez IG, Mika AS, Biesiekierski JR, Costa RJS',
    year: 2023,
    doi: '10.1007/s40279-023-01841-0',
    pmcid: 'PMC10185635',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10185635/',
    attribution:
      'Martinez IG, Mika AS, Biesiekierski JR, Costa RJS (2023). The Effect of Gut-Training and Feeding-Challenge on Markers of Gastrointestinal Status in Response to Endurance Exercise: A Systematic Literature Review. Sports Medicine 53(6):1175-1200. Licensed CC BY 4.0.',
    territory:
      'training the gut, GI distress during long efforts, tolerance to feeding rates',
    verdict: 'in',
    reason:
      'The fuelling sources say how much; an athlete who follows them without gut training gets sick on race day.',
  },
  {
    slug: 'concurrent-training-sequence-2023',
    title:
      'Effects of concurrent training sequence on VO2max and lower limb strength performance: a systematic review and meta-analysis',
    authors: 'Gao J, Yu L',
    year: 2023,
    doi: '10.3389/fphys.2023.1072679',
    pmcid: 'PMC9908959',
    // Unversioned on purpose. Neither the article page nor the Frontiers journal
    // policy states a version, and the register refuses to claim "4.0" for it.
    // Unversioned CC BY is still commercial-use-allowed, so it stays in — and
    // `isAdmissible` accepts a bare "CC BY" precisely so this row can be honest.
    licence: 'CC BY',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9908959/',
    attribution:
      'Gao J, Yu L (2023). Effects of concurrent training sequence on VO2max and lower limb strength performance: a systematic review and meta-analysis. Frontiers in Physiology 14:1072679. Licensed CC BY.',
    territory: 'ordering strength and endurance within a week; the interference effect',
    verdict: 'in',
    reason:
      'Strength is a Session Type the athlete can create, and the Coach has nothing to say about where it sits.',
  },

  // ── Added 2026-08-25, found by citation chaining ──────────────────────────
  //
  // Mined from the reference lists of the eight sources above: 786 references →
  // 733 distinct → 155 in PMC → 92 admissible under the CC0/CC-BY rule. These
  // ten were picked from those 92 to close the gaps `corpus.md` names, **not**
  // by size — the candidate pool inherits the seeds' bias (three of the eight
  // are nutrition papers carrying 475 of the 786 references), so taking the
  // biggest would have deepened a strength instead of fixing a gap. Measured
  // before choosing: the original corpus was 50% nutrition and 4% week/session
  // structure, which is backwards for a product whose main job is planning a week.
  //
  // Licence for each was read in the article's own `<permissions>` block at the
  // PMC URL below and quoted in `corpus.md`. Where no explicit CC statement was
  // present the candidate was dropped rather than assumed — 55 of the 155 fell
  // out exactly that way, which is issue 01's JSSM rule still doing its job.
  {
    slug: 'load-manipulation-aerobic-2019',
    title:
      'A Randomized Controlled Trial Investigating the Effects of Undulatory, Staggered, and Linear Load Manipulations in Aerobic Training on Oxygen Supply, Muscle Injury, and Metabolism in Male Recreational Runners',
    authors: 'Costa, Simao, Perez, et al.',
    year: 2019,
    doi: '10.1186/s40798-019-0200-5',
    pmcid: 'PMC6646634',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6646634/',
    attribution:
      'Costa, Simao, Perez, et al. (2019). A Randomized Controlled Trial Investigating the Effects of Undulatory, Staggered, and Linear Load Manipulations in Aerobic Training. Sports Medicine - Open. Licensed CC BY 4.0.',
    territory: 'load progression within a mesocycle — undulating vs staggered vs linear',
    verdict: 'in',
    reason:
      'The closest the corpus gets to block and mesocycle structure, which issue 01 named its largest single gap. Recreational runners rather than elite subjects, which is nearer the Target Athlete than most of the original list.',
  },
  {
    slug: 'periodized-nutrition-2017',
    title: 'Periodized Nutrition for Athletes',
    authors: 'Jeukendrup',
    year: 2017,
    doi: '10.1007/s40279-017-0694-2',
    pmcid: 'PMC5371625',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5371625/',
    attribution:
      'Jeukendrup (2017). Periodized Nutrition for Athletes. Sports Medicine. Licensed CC BY 4.0.',
    territory: 'matching fuelling to training phase and session purpose',
    verdict: 'in',
    reason:
      'Ties the fuelling sources to the training calendar. The Coach plans a week, not a meal, and this is the source that connects the two.',
  },
  {
    slug: 'hydration-sodium-hot-ultra-2013',
    title:
      'Water and sodium intake habits and status of ultra-endurance runners during a multi-stage ultra-marathon conducted in a hot ambient environment',
    authors: 'Costa, Teixeira, Rama, et al.',
    year: 2013,
    doi: '10.1186/1475-2891-12-13',
    pmcid: 'PMC3554439',
    // CC BY 2.0, not 4.0 — recorded as read. Attribution-only either way, so it
    // passes the rule; the register does not upgrade a version it did not see.
    licence: 'CC BY 2.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3554439/',
    attribution:
      'Costa, Teixeira, Rama, et al. (2013). Water and sodium intake habits and status of ultra-endurance runners during a multi-stage ultra-marathon conducted in a hot ambient environment. Nutrition Journal. Licensed CC BY 2.0.',
    territory: 'heat, hydration, sodium and fluid balance in long efforts',
    verdict: 'in',
    reason:
      'The heat and hydration gap corpus.md named, and the only admissible source found for it. An Ironman is often hot and athletes ask about this constantly.',
  },
  {
    slug: 'running-economy-2015',
    title: 'Running economy: measurement, norms, and determining factors',
    authors: 'Barnes, Kilding',
    year: 2015,
    doi: '10.1186/s40798-015-0007-y',
    pmcid: 'PMC4555089',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4555089/',
    attribution:
      'Barnes, Kilding (2015). Running economy: measurement, norms, and determining factors. Sports Medicine - Open. Licensed CC BY 4.0.',
    territory: 'running economy — what determines it, and normative values',
    verdict: 'in',
    reason:
      'Part of the technique-and-economy gap. Gives the Coach grounded normative values instead of improvising when an athlete asks whether their pace is reasonable.',
  },
  {
    slug: 'strength-female-endurance-2017',
    title:
      'Heavy strength training improves running and cycling performance following prolonged submaximal work in well-trained female athletes',
    authors: 'Vikmoen, Ronnestad, Ellefsen, Raastad',
    year: 2017,
    doi: '10.14814/phy2.13149',
    pmcid: 'PMC5350167',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5350167/',
    attribution:
      'Vikmoen, Ronnestad, Ellefsen, Raastad (2017). Heavy strength training improves running and cycling performance following prolonged submaximal work in well-trained female athletes. Physiological Reports. Licensed CC BY 4.0.',
    territory: 'strength training in female endurance athletes',
    verdict: 'in',
    reason:
      'The female-athlete gap, which corpus.md is blunt about: if a woman is among the first testers, the Coach is ungrounded for her in a way it is not for a man. The first source here with female subjects by design rather than by accident.',
  },
  {
    slug: 'intensity-distribution-comparison-2024',
    title:
      'Comparison of Polarized Versus Other Types of Endurance Training Intensity Distribution on Athletes Endurance Performance: A Systematic Review with Meta-analysis',
    authors: 'Silva Oliveira, Boppre, Fonseca',
    year: 2024,
    doi: '10.1007/s40279-024-02034-z',
    pmcid: 'PMC11329428',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11329428/',
    attribution:
      'Silva Oliveira, Boppre, Fonseca (2024). Comparison of Polarized Versus Other Types of Endurance Training Intensity Distribution on Athletes Endurance Performance: A Systematic Review with Meta-analysis. Sports Medicine. Licensed CC BY 4.0.',
    territory: 'polarized against pyramidal and threshold distributions, compared directly',
    verdict: 'in',
    reason:
      'The existing intensity-distribution review asks whether polarized works; this one asks whether it beats the alternatives, which is the question an athlete actually has.',
  },
  {
    slug: 'training-session-models-2024',
    title:
      'Training Session Models in Endurance Sports: A Norwegian Perspective on Best Practice Recommendations',
    authors: 'Tonnessen, Sandbakk, Seiler, Haugen',
    year: 2024,
    doi: '10.1007/s40279-024-02067-4',
    pmcid: 'PMC11560996',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11560996/',
    attribution:
      'Tonnessen, Sandbakk, Seiler, Haugen (2024). Training Session Models in Endurance Sports: A Norwegian Perspective on Best Practice Recommendations. Sports Medicine. Licensed CC BY 4.0.',
    territory: 'session design — what an individual session should actually look like',
    verdict: 'in',
    reason:
      'Probably the single most directly usable source in the corpus for Week Plan generation: it describes concrete session models rather than reporting an effect. Seiler is among the authors.',
  },
  {
    slug: 'strength-female-runners-2016',
    title:
      'Effects of Heavy Strength Training on Running Performance and Determinants of Running Performance in Female Endurance Athletes',
    authors: 'Vikmoen, Raastad, Seynnes, et al.',
    year: 2016,
    doi: '10.1371/journal.pone.0150799',
    pmcid: 'PMC4783109',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4783109/',
    attribution:
      'Vikmoen, Raastad, Seynnes, et al. (2016). Effects of Heavy Strength Training on Running Performance and Determinants of Running Performance in Female Endurance Athletes. PLoS ONE. Licensed CC BY 4.0.',
    territory: 'strength training and running performance in female endurance athletes',
    verdict: 'in',
    reason:
      'The companion to the 2017 study above, on running specifically. Kept alongside it rather than instead of it, because between them they cover both disciplines for female athletes.',
  },
  {
    slug: 'concurrent-training-order-2020',
    title:
      'Order of same-day concurrent training influences some indices of power development, but not strength, lean mass, or aerobic fitness',
    authors: 'Lee, Ballantyne, Chagolla, et al.',
    year: 2020,
    doi: '10.1371/journal.pone.0233134',
    pmcid: 'PMC7224562',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7224562/',
    attribution:
      'Lee, Ballantyne, Chagolla, et al. (2020). Order of same-day concurrent training influences some indices of power development, but not strength, lean mass, or aerobic fitness in healthy, moderately-active men after 9 weeks of training. PLoS ONE. Licensed CC BY 4.0.',
    territory: 'ordering strength and endurance within the same day',
    verdict: 'in',
    reason:
      'The existing concurrent-training meta-analysis covers sequence in general; this covers same-day ordering, which is the form the question takes when the athlete has one evening for both.',
  },
  {
    slug: 'intensified-training-overreaching-2016',
    title:
      'Impact of intensified training and carbohydrate supplementation on immunity and markers of overreaching in highly trained cyclists',
    authors: 'Svendsen, Killer, Carter, et al.',
    year: 2016,
    doi: '10.1007/s00421-016-3340-z',
    pmcid: 'PMC4834106',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4834106/',
    attribution:
      'Svendsen, Killer, Carter, et al. (2016). Impact of intensified training and carbohydrate supplementation on immunity and markers of overreaching in highly trained cyclists. European Journal of Applied Physiology. Licensed CC BY 4.0.',
    territory: 'intensified training blocks, overreaching markers, illness risk',
    verdict: 'in',
    reason:
      'Load monitoring with measured markers, beside the overtraining review which is about cognition. Together they let the Coach say something grounded when a Check-in reports accumulating fatigue.',
  },


  // ── Added 2026-08-25, third pass: a fresh PMC search on the gaps ──────────
  //
  // Citation chaining was exhausted — the eight seeds could not cite what they
  // were not about, so injury and return-to-training came back empty. These came
  // from a direct PMC search (esearch, `pmc cc by license[filter]`), shaped by
  // **Mads's posture ruling of 2026-08-25**: the Coach is *not a medical coach*,
  // but may hold material on avoiding injuries and training around them.
  //
  // That ruling is a sourcing rule, and it is what these rows were selected by:
  //   IN  — prevention, risk factors, load management and monitoring, training
  //         modification, graded return principles, energy availability.
  //   OUT — diagnosis, treatment, rehabilitation protocols, clinical management,
  //         imaging, surgery. The Coach still defers there, and the corpus holds
  //         nothing to tempt it otherwise.
  //
  // Of 17 candidates checked, 3 stated no Creative Commons licence and were
  // dropped rather than assumed, and 1 was dropped as methodological (how
  // researchers *define* injury, which is not coaching material).
  {
    slug: 'monitoring-training-effects-2026',
    title:
      'Monitoring Training Effects in Athletes: A Multidimensional Framework for Decision-Making',
    authors: 'Rebelo, Bishop, Thorpe, et al.',
    year: 2026,
    doi: '10.1007/s40279-026-02417-4',
    pmcid: 'PMC13388359',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13388359/',
    attribution:
      'Rebelo, Bishop, Thorpe, et al. (2026). Monitoring Training Effects in Athletes: A Multidimensional Framework for Decision-Making. Sports Medicine (Auckland, N.z.). Licensed CC BY 4.0.',
    territory: 'monitoring training effects — turning athlete signals into training decisions',
    verdict: 'in',
    reason:
      'The largest single addition, and the closest thing in the corpus to a description of the Coach\'s own job: reading collected signals and deciding what to change. Directly relevant to Check-in handling.',
  },
  {
    slug: 'return-to-running-criteria-2024',
    title:
      'Criteria and Guidelines for Returning to Running Following a Tibial Bone Stress Injury: A Scoping Review',
    authors: 'George, Sheerin, Reid',
    year: 2024,
    doi: '10.1007/s40279-024-02051-y',
    pmcid: 'PMC11393297',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11393297/',
    attribution:
      'George, Sheerin, Reid (2024). Criteria and Guidelines for Returning to Running Following a Tibial Bone Stress Injury: A Scoping Review. Sports Medicine (Auckland, N.z.). Licensed CC BY 4.0.',
    territory: 'graded return-to-running criteria and progression after a bone stress injury',
    verdict: 'in',
    reason:
      'The \'working around it\' half of Mads\'s posture ruling: how a return is staged, not how an injury is treated. Injury-specific (tibial bone stress) because that is where the return-to-running literature actually is — the Coach still defers on diagnosis.',
  },
  {
    slug: 'injury-prevention-programmes-2024',
    title:
      'Do Exercise-Based Prevention Programs Reduce Injury in Endurance Runners? A Systematic Review and Meta-Analysis',
    authors: 'Wu, Brooke-Wavell, Fong, et al.',
    year: 2024,
    doi: '10.1007/s40279-024-01993-7',
    pmcid: 'PMC11127851',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11127851/',
    attribution:
      'Wu, Brooke-Wavell, Fong, et al. (2024). Do Exercise-Based Prevention Programs Reduce Injury in Endurance Runners? A Systematic Review and Meta-Analysis. Sports Medicine (Auckland, N.z.). Licensed CC BY 4.0.',
    territory: 'injury prevention programmes for endurance runners — what actually reduces injury',
    verdict: 'in',
    reason:
      'The single most on-posture source in the corpus: it asks whether prevention *programmes* work, which is a coaching question, not a clinical one. Prevention is the half of injury the Coach may speak to.',
  },
  {
    slug: 'low-energy-availability-bone-2025',
    title:
      'Low Energy Availability and Its Impact on Bone Health and Metabolism in Athletes: A Narrative Review',
    authors: 'KONVIČKA, KÁŇOVÁ, BORZENKO, et al.',
    year: 2025,
    doi: '10.33549/physiolres.935749',
    pmcid: 'PMC12849792',
    licence: 'CC BY 4.0',
    // **The one row where the sources disagreed — read this before trusting a
    // licence audit that says "all clear".** A Crossref/OpenAlex sweep on
    // 2026-08-28 reported this article as `cc-by-nc` from the publisher's own
    // deposited metadata, while PMC and Europe PMC both report `cc-by`. That is
    // the exact shape of the JSSM failure this register was built to catch, so
    // it was resolved at the journal rather than by preferring whichever source
    // was convenient: biomed.cas.cz states "Physiological Research is an Open
    // Access journal under the Creative Commons license (CC BY) since July 1,
    // 2023", and this article is 2025. The `cc-by-nc` is a stale deposit
    // template predating that policy change, not a restriction.
    //
    // Recorded rather than quietly corrected, because the next licence sweep
    // will raise the same alarm on the same row and should not have to
    // re-derive the answer.
    licenceUrl: 'https://www.biomed.cas.cz/physiolres/',
    attribution:
      'KONVIČKA, KÁŇOVÁ, BORZENKO, et al. (2025). Low Energy Availability and Its Impact on Bone Health and Metabolism in Athletes: A Narrative Review. Physiological Research. Licensed CC BY 4.0.',
    territory: 'low energy availability, bone health and bone-injury risk',
    verdict: 'in',
    reason:
      'Bridges the corpus\'s strongest area to its weakest: under-fuelling is the main modifiable cause of bone stress injury, which makes this prevention rather than medicine.',
  },
  {
    slug: 'sleep-interventions-performance-2023',
    title:
      'The Impact of Sleep Interventions on Athletic Performance: A Systematic Review',
    authors: 'Cunha, Costa, Marques, et al.',
    year: 2023,
    doi: '10.1186/s40798-023-00599-z',
    pmcid: 'PMC10354314',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10354314/',
    attribution:
      'Cunha, Costa, Marques, et al. (2023). The Impact of Sleep Interventions on Athletic Performance: A Systematic Review. Sports Medicine - Open. Licensed CC BY 4.0.',
    territory: 'sleep interventions and their effect on athletic performance',
    verdict: 'in',
    reason:
      'The sleep gap corpus.md named. The weekly Check-in asks about sleep, so until now the Coach was handed sleep data it had no grounded science to interpret.',
  },
  {
    slug: 'running-injury-risk-factors-2022',
    title:
      'Running-Related Biomechanical Risk Factors for Overuse Injuries in Distance Runners: A Systematic Review Considering Injury Specificity and the Potentials for Future Research',
    authors: 'Willwacher, Kurz, Robbin, et al.',
    year: 2022,
    doi: '10.1007/s40279-022-01666-3',
    pmcid: 'PMC9325808',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9325808/',
    attribution:
      'Willwacher, Kurz, Robbin, et al. (2022). Running-Related Biomechanical Risk Factors for Overuse Injuries in Distance Runners: A Systematic Review Considering Injury Specificity and the Potentials for Future Research. Sports Medicine (Auckland, N.z.). Licensed CC BY 4.0.',
    territory: 'biomechanical risk factors for overuse injury in distance runners',
    verdict: 'in',
    reason:
      'Risk factors are what an athlete can act on before anything hurts. Paired with the prevention meta-analysis so the Coach can say what raises risk as well as what lowers it.',
  },
  {
    slug: 'low-energy-availability-female-2022',
    title:
      'Contributing Factors to Low Energy Availability in Female Athletes: A Narrative Review of Energy Availability, Training Demands, Nutrition Barriers, Body Image, and Disordered Eating',
    authors: 'Jagim, Fields, Magee, et al.',
    year: 2022,
    doi: '10.3390/nu14050986',
    pmcid: 'PMC8912784',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8912784/',
    attribution:
      'Jagim, Fields, Magee, et al. (2022). Contributing Factors to Low Energy Availability in Female Athletes: A Narrative Review of Energy Availability, Training Demands, Nutrition Barriers, Body Image, and Disordered Eating. Nutrients. Licensed CC BY 4.0.',
    territory: 'what causes low energy availability in female athletes',
    verdict: 'in',
    reason:
      'The contributing-factors companion to the RED-S source above: that one describes the consequence, this one what leads there, which is where a Coach can intervene.',
  },
  {
    slug: 'low-carb-availability-reds-female-2023',
    title:
      'Considerations of Low Carbohydrate Availability (LCA) to Relative Energy Deficiency in Sport (RED-S) in Female Endurance Athletes: A Narrative Review',
    authors: 'Lodge, Ward-Ritacco, Melanson, Deldicque',
    year: 2023,
    doi: '10.3390/nu15204457',
    pmcid: 'PMC10609849',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10609849/',
    attribution:
      'Lodge, Ward-Ritacco, Melanson, Deldicque (2023). Considerations of Low Carbohydrate Availability (LCA) to Relative Energy Deficiency in Sport (RED-S) in Female Endurance Athletes: A Narrative Review. Nutrients. Licensed CC BY 4.0.',
    territory: 'low carbohydrate availability leading to RED-S in female endurance athletes',
    verdict: 'in',
    reason:
      'Energy availability, the female athlete, and endurance sport in one source — three gaps at once, and the fuelling angle the Coach is already equipped to discuss.',
  },
  {
    slug: 'psychosocial-overuse-risk-2021',
    title:
      'Psychosocial Risk Factors for Overuse Injuries in Competitive Athletes: A Mixed-Studies Systematic Review',
    authors: 'Tranaeus, Martin, Ivarsson',
    year: 2021,
    doi: '10.1007/s40279-021-01597-5',
    pmcid: 'PMC8938379',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8938379/',
    attribution:
      'Tranaeus, Martin, Ivarsson (2021). Psychosocial Risk Factors for Overuse Injuries in Competitive Athletes: A Mixed-Studies Systematic Review. Sports Medicine (Auckland, N.z.). Licensed CC BY 4.0.',
    territory: 'psychosocial risk factors for overuse injury — stress, life load, motivation',
    verdict: 'in',
    reason:
      'Connects Mind Feedback, the product\'s stated differentiator, to injury risk. The Coach already collects a mental signal every Check-in and until now had no grounded reason to act on it.',
  },
  {
    slug: 'sleep-ultra-endurance-2026',
    title:
      'The Role of Sleep on Physical and Cognitive Performance of Ultra-Endurance Athletes: A Systematic Review',
    authors: 'Guilherme, Rodrigues, Rosa, et al.',
    year: 2026,
    doi: '10.3390/jcm15041398',
    pmcid: 'PMC12941826',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12941826/',
    attribution:
      'Guilherme, Rodrigues, Rosa, et al. (2026). The Role of Sleep on Physical and Cognitive Performance of Ultra-Endurance Athletes: A Systematic Review. Journal of Clinical Medicine. Licensed CC BY 4.0.',
    territory: 'sleep in ultra-endurance athletes, physical and cognitive',
    verdict: 'in',
    reason:
      'Sleep evidence in the endurance population specifically, rather than generalised from team sport.',
  },
  {
    slug: 'reverse-periodization-2022',
    title:
      'Reverse Periodization for Improving Sports Performance: A Systematic Review',
    authors: 'González-Ravé, González-Mohino, Rodrigo-Carranza, Pyne',
    year: 2022,
    doi: '10.1186/s40798-022-00445-8',
    pmcid: 'PMC9023617',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9023617/',
    attribution:
      'González-Ravé, González-Mohino, Rodrigo-Carranza, Pyne (2022). Reverse Periodization for Improving Sports Performance: A Systematic Review. Sports Medicine - Open. Licensed CC BY 4.0.',
    territory: 'reverse periodization — ordering volume and intensity across a season',
    verdict: 'in',
    reason:
      'Periodization proper, which citation chaining could not reach. Tests an ordering against the conventional one, so the Coach has grounds for why a block is shaped the way it is.',
  },
  {
    slug: 'sex-differences-running-injury-2021',
    title:
      'Sex-Specific Differences in Running Injuries: A Systematic Review with Meta-Analysis and Meta-Regression',
    authors: 'Hollander, Rahlf, Wilke, et al.',
    year: 2021,
    doi: '10.1007/s40279-020-01412-7',
    pmcid: 'PMC8053184',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8053184/',
    attribution:
      'Hollander, Rahlf, Wilke, et al. (2021). Sex-Specific Differences in Running Injuries: A Systematic Review with Meta-Analysis and Meta-Regression. Sports Medicine (Auckland, N.z.). Licensed CC BY 4.0.',
    territory: 'how running injuries differ between men and women',
    verdict: 'in',
    reason:
      'Prevention and the female-athlete gap at once. Most of the corpus generalises from male-dominant samples; this is the source that says where that generalisation breaks.',
  },
  {
    slug: 'napping-sports-performance-2022',
    title:
      'A systematic review of effects of daytime napping strategies on sports performance in physically active individuals with and without partial-sleep deprivation',
    authors: 'Sirohi, Khan, Sharma, et al.',
    year: 2022,
    doi: '10.7717/peerj.14460',
    pmcid: 'PMC9744144',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9744144/',
    attribution:
      'Sirohi, Khan, Sharma, et al. (2022). A systematic review of effects of daytime napping strategies on sports performance in physically active individuals with and without partial-sleep deprivation. PeerJ. Licensed CC BY 4.0.',
    territory: 'daytime napping and sports performance',
    verdict: 'in',
    reason:
      'The practical end of the sleep gap: an athlete training around a full life often cannot extend night sleep, and napping is the lever that remains.',
  },

  // ── Added 2026-08-27/28, to cover territories the OUT rows below left empty ─
  {
    slug: 'block-vs-traditional-cyclists-2022',
    title:
      'No Differences Between 12 Weeks of Block- vs. Traditional-Periodized Training in Performance Adaptations in Trained Cyclists',
    authors:
      'Almquist NW, Eriksen HB, Wilhelmsen M, Hamarsland H, Ing S, Ellefsen S, Sandbakk Ø, Rønnestad BR, Skovereng K',
    year: 2022,
    doi: '10.3389/fphys.2022.837634',
    pmcid: 'PMC8921659',
    licence: 'CC BY 4.0',
    // Article page and the publisher's own policy, per the rule. Frontiers:
    // "All Frontiers articles are published with open access under the CC-BY
    // Creative Commons attribution license."
    licenceUrl: 'https://www.frontiersin.org/about/policies-and-publication-ethics',
    attribution:
      'Almquist NW, Eriksen HB, Wilhelmsen M, Hamarsland H, Ing S, Ellefsen S, Sandbakk Ø, Rønnestad BR, Skovereng K (2022). No Differences Between 12 Weeks of Block- vs. Traditional-Periodized Training in Performance Adaptations in Trained Cyclists. Frontiers in Physiology 13:837634. Licensed CC BY 4.0.',
    territory: 'block vs traditional periodization; mesocycle structure',
    verdict: 'in',
    reason:
      'Covers the territory `block-periodization-2019` was wanted for, which is out on CC BY-NC. Deliberately the load-matched null result rather than a meta-analysis reporting a small effect: a Coach holding only the favourable finding will overclaim, and "no difference once load is matched" is the more useful thing to be able to say.',
  },
  {
    slug: 'age-group-triathlon-training-load-2026',
    title:
      'Training load and intensity in triathlon: objective differences between sex, age, race distance preference and training phase across a cohort of 95 age-group triathletes over six months',
    authors: 'Wells LA, Hoffmann SM, Bruce L, Kremer P, Dwyer DB',
    year: 2026,
    doi: '10.3389/fspor.2026.1798702',
    pmcid: 'PMC13171522',
    licence: 'CC BY',
    // Frontiers again: version unstated on the article, as with row 8, so the
    // version is not claimed. Publisher policy read.
    licenceUrl: 'https://www.frontiersin.org/about/policies-and-publication-ethics',
    attribution:
      'Wells LA, Hoffmann SM, Bruce L, Kremer P, Dwyer DB (2026). Training load and intensity in triathlon: objective differences between sex, age, race distance preference and training phase across a cohort of 95 age-group triathletes over six months. Frontiers in Sports and Active Living 8:1798702. Licensed CC BY.',
    territory:
      'what age-group long-course triathletes actually train — weekly volume, load and how it moves by phase',
    verdict: 'in',
    reason:
      'Replaces `half-ironman-intensity-distribution-2019`, which is out on NC-ND, and is a better source for this product than the paper it replaces: 95 age-group triathletes over 34,731 sessions and six months, split by race-distance preference and training phase. Long-course specialists at 615 min and 574 TSS a week against short-course at 507 and 452 — the only row in the register describing what this product’s actual athlete does, rather than what a trained cohort did in a lab.',
  },
  {
    slug: 'mitochondrial-capillary-growth-2024',
    title:
      'Effects of Exercise Training on Mitochondrial and Capillary Growth in Human Skeletal Muscle: A Systematic Review and Meta-Regression',
    authors: 'Mølmen KS, Almquist NW, Skattebo Ø',
    year: 2024,
    doi: '10.1007/s40279-024-02120-2',
    pmcid: 'PMC11787188',
    licence: 'CC BY 4.0',
    // **Weaker provenance than the two rows above, recorded rather than
    // smoothed over.** Sports Medicine is a hybrid journal, and Springer's own
    // article page redirects to an authorization endpoint, so the publisher
    // policy could not be read. Two independent sources agree instead: PMC
    // carries the full CC BY 4.0 International text with author-retained
    // copyright — not the bare journal copyright that made the JSSM row
    // dangerous — and OpenAlex reports `cc-by` from Crossref metadata. Re-read
    // at the publisher if institutional access ever makes that possible.
    licenceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11787188/',
    attribution:
      'Mølmen KS, Almquist NW, Skattebo Ø (2024). Effects of Exercise Training on Mitochondrial and Capillary Growth in Human Skeletal Muscle: A Systematic Review and Meta-Regression. Sports Medicine 55(1):115–144. Licensed CC BY 4.0.',
    territory:
      'why endurance training works — mitochondrial and capillary adaptation, and what determines how much of it an athlete gets',
    verdict: 'in',
    reason:
      'The mechanism layer the corpus otherwise lacks, and the role `openstax-anatomy-physiology-2e` was wanted for before it turned out to be CC BY-NC-SA. Coaching-relevant rather than merely explanatory: adaptation scales with training load, and its size is largely set by where the athlete started — which is the evidence behind telling a fit athlete and a beginner different things about the same week.',
  },

  // ── OUT — retained by design, so each is refused by name ──────────────────
  {
    slug: 'half-ironman-intensity-distribution-2019',
    title:
      'Polarized and Pyramidal Training Intensity Distribution: Relationship with a Half-Ironman Distance Triathlon Competition',
    authors: 'Selles-Perez S, Fernandez-Saez J, Cejuela R',
    year: 2019,
    doi: '',
    pmcid: null,
    licence: 'CC BY-NC-ND 4.0',
    // The journal's own policy page, NOT the PMC article page. PMC shows only
    // "© Journal of Sports Science and Medicine" with no Creative Commons notice
    // — a pipeline that trusted PMC would have found nothing saying "restricted".
    // This row is why the rule is to read the publisher's policy.
    licenceUrl: 'https://www.jssm.org/newresearchergsc.php',
    attribution: '',
    territory: 'half-Ironman intensity distribution in recreational triathletes',
    verdict: 'out',
    outReason: 'licence-restrictive',
    reason:
      'NonCommercial and NoDerivatives — fails the admission rule twice. Closer to our athlete than anything in the IN list; ask JSSM for permission rather than assuming.',
  },
  {
    slug: 'block-periodization-2019',
    title:
      'Block periodization of endurance training: a systematic review and meta-analysis',
    authors: 'Molmen KS, Ofsteng SJ, Ronnestad BR',
    year: 2019,
    doi: '10.2147/OAJSM.S180408',
    pmcid: null,
    licence: 'CC BY-NC 3.0',
    licenceUrl: 'https://www.dovepress.com/terms.php',
    attribution: '',
    territory: 'block vs traditional periodization; mesocycle structure',
    verdict: 'out',
    outReason: 'licence-restrictive',
    reason:
      'CC BY-NC 3.0 unported, read off the article page by Mads (2026-08-27) after dovepress.com returned 403 to every automated attempt. "Non-commercial uses of the work are permitted without further permission... For permission for commercial use of this work, please see paragraphs 4.2 and 5 of our Terms." NonCommercial fails the rule, since this product will charge athletes. **Closed — do not re-check**, and note that commercial permission is purchasable from Dove Medical Press if this paper is ever wanted badly enough. The guess recorded here was right, where the OpenStax one was wrong; that is the argument for reading rather than for guessing better.',
  },
  {
    slug: 'openstax-anatomy-physiology-2e',
    title: 'Anatomy and Physiology 2e',
    authors: 'OpenStax',
    year: 2022,
    doi: '',
    pmcid: null,
    licence: 'CC BY-NC-SA 4.0',
    licenceUrl: 'https://openstax.org/details/books/anatomy-and-physiology-2e',
    attribution: '',
    territory: 'plain-language physiology fundamentals',
    verdict: 'out',
    outReason: 'licence-restrictive',
    reason:
      'CC BY-NC-SA, read off the licence badge on the book page by Mads (2026-08-27). Fails the admission rule twice: NonCommercial, because this product will charge athletes, and ShareAlike, which is out pending a deliberate decision about the Coach’s own output. **Closed — do not re-check.** The note here previously said "OpenStax states CC BY on its books generally", and that guess was wrong: the second time in this register that a "widely understood to be CC BY" assumption failed once somebody actually read the page, after the JSSM half-Ironman paper. Independently, it carries no PMC id, and the ingest fetches JATS from PMC by id — so it could not have been ingested even had the licence passed.',
  },
  {
    slug: 'friel-triathletes-training-bible',
    title: 'The Triathlete’s Training Bible',
    authors: 'Friel J',
    year: 2016,
    doi: '',
    pmcid: null,
    licence: 'all rights reserved',
    licenceUrl: '',
    attribution: '',
    territory: 'periodization, season planning, the full coaching method',
    verdict: 'out',
    outReason: 'commercial',
    reason:
      'Commercial, all rights reserved. Out until a licence exists (PRD Decision 1). Licensing later is additive — a new source against this same pipeline.',
  },
  {
    slug: 'bosquet-taper-meta-analysis-2007',
    title: 'Effects of tapering on performance: a meta-analysis',
    authors: 'Bosquet L, Montpetit J, Arvisais D, Mujika I',
    year: 2007,
    doi: '10.1249/mss.0b013e31806010e0',
    pmcid: null,
    licence: 'all rights reserved',
    licenceUrl: '',
    attribution: '',
    territory: 'taper',
    verdict: 'out',
    outReason: 'commercial',
    reason:
      'Subscription, all rights reserved. The 2023 PLOS ONE meta-analysis covers the same territory under CC BY, so nothing is lost.',
  },
  {
    slug: 'gssi-sports-science-articles',
    title: 'Gatorade Sports Science Institute articles',
    authors: 'Gatorade Sports Science Institute',
    year: 0,
    doi: '',
    pmcid: null,
    licence: '',
    licenceUrl: '',
    attribution: '',
    territory: 'hydration, fuelling, heat',
    verdict: 'out',
    outReason: 'commercial',
    reason:
      'Proprietary web content, no reuse licence. Frequently cited in this territory and consistently unusable.',
  },
];

/** Thrown when a source is asked for that the register will not admit. */
export class SourceRefused extends Error {
  constructor(
    readonly slug: string,
    message: string,
  ) {
    super(message);
    this.name = 'SourceRefused';
  }
}

/** Every source the register admits, in declaration order. */
export function admittedSources(): CorpusSource[] {
  return CORPUS.filter((s) => s.verdict === 'in');
}

export function findSource(slug: string): CorpusSource | undefined {
  return CORPUS.find((s) => s.slug === slug);
}

/**
 * Return a source, or refuse it by name.
 *
 * The verdict is checked **before** the licence, and that ordering is the point.
 * A row marked out stays out even if its licence string would pass on its own —
 * the verdict is a decision a human took with the publisher's policy page open,
 * and re-deriving it from one field would quietly overrule them. The licence
 * check that follows is the belt to that braces: it catches an IN row whose
 * licence was edited to something inadmissible without the verdict being
 * revisited.
 */
export function admit(slug: string): CorpusSource {
  const source = findSource(slug);

  if (!source) {
    throw new SourceRefused(
      slug,
      `Unknown source "${slug}". It is not in the corpus register, and a source ` +
        'the register has never ruled on is not ingestible. Add a row to ' +
        'corpus.md first, with its licence read at a URL.',
    );
  }

  return admitSource(source);
}

/**
 * The admission check itself, on a row rather than a slug.
 *
 * Split out from `admit` so the ordering rule above can be tested on a row the
 * register does not contain — an OUT row whose licence string *would* pass. No
 * real row looks like that today, and one should never need to be added just to
 * prove the code prefers the verdict.
 */
export function admitSource(source: CorpusSource): CorpusSource {
  const slug = source.slug;

  if (source.verdict === 'out') {
    throw new SourceRefused(
      slug,
      `Refusing "${slug}" (${source.title}): the corpus register marks it OUT ` +
        `(${source.outReason}). ${source.reason}`,
    );
  }

  if (!isAdmissible(source.licence)) {
    throw new SourceRefused(
      slug,
      `Refusing "${slug}" (${source.title}): licence "${source.licence}" is not ` +
        'CC0 or CC BY. The register marks it IN, which contradicts its own ' +
        'licence field — fix the register before ingesting.',
    );
  }

  return source;
}
