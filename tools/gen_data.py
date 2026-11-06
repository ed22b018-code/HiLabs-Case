"""Generates data.json for the prototype. Mirrors the Excel annex (same IDs, records, flaws, scores)."""
import json, pathlib

ANCHOR = "2026-11-09T08:00"

def c(id, number, type_, owner, source, updated, last, best, consent, status, rank, note=""):
    return dict(id=id, number=number, type=type_, owner=owner, source=source, updated=updated, lastSuccess=last, bestTime=best,
                textConsent=consent, status=status, rank=rank, note=note)

def ev(rec, src, text):
    return dict(rec=rec, src=src, text=text)

P = []

# ---------------------------------------------------------------- P1
P.append(dict(
  id="P1", member="SYN-M-20417", name="Dorothy Hale", age=78, sex="F", plan="Medicare Advantage HMO", program="Transitions of care · heart failure",
  pcp="Dr. Alan Mercer", language="English", authRep="Karen Hale (daughter), HIPAA authorization 03/2025", hero=True,
  risk=5, window=3, reach=0.8,
  why=["Day 3 of 7 after HF discharge", "New HF meds unfilled; stopped ACE inhibitor refilled", "Daughter reachable evenings"],
  nba="Call now. Resolve Entresto PA, cancel lisinopril, book PCP by Fri with a ride",
  scenario="Fresh heart-failure discharge with a dangerous medication mix-up",
  contacts=[c("CP-1002", "(312) 555-0187", "Mobile", "Karen Hale, daughter (authorised)", "CASE", "2025-03-02", "2026-06-10", "After 18:00", "Yes", "Active", 2, "Authorised representative: evening fallback"),
            c("CP-1001", "(312) 555-0142", "Home", "Dorothy (member)", "ELIG", "2019-05-01", "2026-06-10", "Mornings", "n/a", "Unanswered Sat & Sun (weekend RN)", 1, "Dorothy answers mornings; husband hard of hearing")],
  signals=[
    dict(code="S1", title="Discharge meds not filled", confidence="High · 3 sources agree", measure="TRC · medication reconciliation",
         mode="Auto-detected · Maria confirms the plan", rule="Discharged ≤7 days AND a new discharge medication has no paid fill within 72 h",
         evidence=[ev("ADT-0002", "ADT", "Discharged Fri 6 Nov 14:05 from County General, disposition home"),
                   ev("HIE-1001", "HIE", "Discharge summary: START sacubitril/valsartan 24/26 mg BID; INCREASE furosemide to 40 mg"),
                   ev("RX-1004", "RX", "Sacubitril/valsartan REJECTED Sat 7 Nov 10:02 · NCPDP 75 Prior Authorization Required"),
                   ev("UM-1001", "UM", "No Part D coverage determination requested yet")],
         guards=["No mail-order fill pending (not enrolled)", "Not transferred to a SNF (no further ADT)", "Member still enrolled"],
         actions=["Call now: confirm exactly what she is taking", "Ask prescriber for an EXPEDITED coverage determination (24 h decision)",
                  "Once approved: pharmacy home delivery (CB-1002)", "Teach-back on the new furosemide 40 mg dose"]),
    dict(code="S3", title="Medication lists disagree: unsafe combination", confidence="High · discharge list vs. paid fill", measure="TRC · medication reconciliation",
         mode="Auto-flagged · Maria decides", rule="A drug stopped at discharge is still being filled, or the same drug class differs across sources",
         evidence=[ev("HIE-1001", "HIE", "Discharge summary: STOP lisinopril 10 mg (replaced by sacubitril/valsartan)"),
                   ev("RX-1003", "RX", "Lisinopril 10 mg AUTO-REFILLED Sat 7 Nov 09:15")],
         guards=["Both records belong to the same member and pharmacy"],
         actions=["Tell Dorothy not to take lisinopril with the new heart medicine (36-hour washout required)",
                  "Ask the pharmacy to cancel the lisinopril auto-refill", "Prescriber confirms the switch-over plan"]),
    dict(code="S2", title="7-day visit at risk", confidence="High", measure="TRC · patient engagement",
         mode="Auto-detected · Maria books", rule="Day ≥3 after discharge and no PCP visit booked or billed",
         evidence=[ev("ADT-0002", "ADT", "Day 3 of 7 since discharge"), ev("DIR-0001", "DIR", "Dr. Mercer: phone verified by HiLabs 2 Nov; same-week slot Thu 12 Nov"),
                   ev("CN-1001", "CASE", "Aug note: husband no longer drives (HRA still says 'spouse drives')")],
         guards=["No visit on claims or case notes"],
         actions=["Book Dr. Mercer Thu 12 Nov", "Book plan ride benefit (CB-1001: 12 trips left)"]),
  ],
  suppressed=[],
  conflicts=[
    dict(topic="Lisinopril", severity="Unsafe", a=dict(src="HIE", rec="HIE-1001", value="STOP (discharge summary)", at="7 Nov 09:12"),
         b=dict(src="RX", rec="RX-1003", value="Filled 10 mg × 30 days (auto-refill)", at="7 Nov 09:15"),
         note="ACE inhibitor + sacubitril/valsartan is contraindicated; 36-hour washout before starting it."),
    dict(topic="Furosemide dose", severity="Check", a=dict(src="HIE", rec="HIE-1001", value="40 mg daily (increased)", at="7 Nov"),
         b=dict(src="RX", rec="RX-1001", value="20 mg daily (last fill 30 Sep)", at="30 Sep"), note="New dose never dispensed."),
    dict(topic="Transport", severity="Stale", a=dict(src="SDOH", rec="SD-1001", value="'Spouse drives' (HRA)", at="2 Mar"),
         b=dict(src="CASE", rec="CN-1001", value="Husband no longer drives (vision)", at="21 Aug"), note="Newer note wins; offer ride benefit."),
  ],
  meds=[dict(name="Sacubitril/valsartan 24/26 mg BID", clinical="START", pharmacy="Rejected: PA required (7 Nov)", status="Not filled", rec="RX-1004"),
        dict(name="Furosemide", clinical="40 mg daily", pharmacy="20 mg (30 Sep)", status="Dose change not filled", rec="RX-1001"),
        dict(name="Metoprolol succinate ER 50 mg", clinical="Continue", pharmacy="Filled 20 Oct", status="OK", rec="RX-1002"),
        dict(name="Lisinopril 10 mg", clinical="STOP", pharmacy="Refilled 7 Nov", status="Stopped but refilled", rec="RX-1003")],
  missing=[dict(what="Part D coverage determination for sacubitril/valsartan", expected="Not requested", action="Ask prescriber: expedited, 24 h"),
           dict(what="Follow-up appointment", expected="None booked", action="Book Thu 12 Nov"),
           dict(what="Inpatient claim for 3–6 Nov stay", expected="~4 Dec (claims lag)", action="None: ADT + discharge summary already cover it")],
  labs=[dict(test="BNP", value="1,240 pg/mL", flag="H", at="3 Nov", rec="LAB-1001", note="After Entresto starts, track NT-proBNP"),
        dict(test="Potassium", value="5.3 mmol/L", flag="H", at="6 Nov", rec="LAB-1002", note=""),
        dict(test="Creatinine", value="1.4 mg/dL", flag="H", at="6 Nov", rec="LAB-1003", note="")],
  gaps=["TRC: notification, discharge info, engagement, med rec all open"],
  timeline=[dict(at="2026-11-03 21:10", src="ADT", rec="ADT-0001", text="Admitted via ED, County General (no diagnosis in message)", received="3 Nov 21:25", visible=True),
            dict(at="2026-11-06 14:05", src="ADT", rec="ADT-0002", text="Discharged home", received="6 Nov 14:20", visible=True),
            dict(at="2026-11-06 14:05", src="ADT", rec="ADT-0003", text="Duplicate discharge message: merged, no second task", received="6 Nov 16:40", visible=True, flag="IMP-P1-01"),
            dict(at="2026-11-06 16:45", src="CASE", rec="CN-1002", text="Transitions-of-care case auto-opened", received="6 Nov", visible=True),
            dict(at="2026-11-07 09:12", src="HIE", rec="HIE-1001", text="Discharge summary received (EF 30%; med changes)", received="7 Nov 09:12", visible=True),
            dict(at="2026-11-07 09:15", src="RX", rec="RX-1003", text="Lisinopril auto-refilled (was STOPPED)", received="7 Nov", visible=True, flag="IMP-P1-02"),
            dict(at="2026-11-07 10:02", src="RX", rec="RX-1004", text="Sacubitril/valsartan rejected: PA required", received="7 Nov", visible=True, flag="IMP-P1-03"),
            dict(at="2026-11-07 10:15", src="CON", rec="AT-1001", text="Weekend RN called home: no answer", received="7 Nov", visible=True),
            dict(at="2026-11-08 11:30", src="CON", rec="AT-1002", text="Weekend RN called home: no answer (daughter not tried)", received="8 Nov", visible=True),
            dict(at="2026-12-04", src="CLM", rec="CLM-1002", text="Inpatient claim expected (~4 weeks lag)", received="expected ~4 Dec", visible=False, flag="IMP-P1-04")],
  sources=[["ADT", "6 Nov 16:40"], ["HIE", "7 Nov 09:12"], ["RX", "7 Nov 10:02"], ["LAB", "7 Nov"], ["CLM", "29 Sep (stay not yet billed)"], ["SDOH", "2 Mar (250 days)"], ["DIR", "2 Nov"], ["CASE", "6 Nov"]],
  transcript="""Mon 9 Nov 08:25 · Maria calls home line (312) 555-0142. Dorothy answers; husband Ray on speaker.
Maria: Good morning Mrs. Hale, this is Maria, your nurse from Synthetica Health. How are you feeling since you got home Friday?
Dorothy: Tired. My ankles are a bit puffy again. I sleep on two pillows like before.
Maria: Are you weighing yourself each morning?
Dorothy: 172 this morning. In the hospital they said 168.
Maria: Can you read me the bottles you are taking?
Dorothy: The water pill, the small 20 milligram one. Metoprolol. And the lisinopril, they sent a new bottle Saturday.
Maria: Did you get the new heart medicine, Entresto?
Dorothy: No. The pharmacy said the insurance needed something from the doctor.
Ray: I can't drive her anymore, my eyes. Karen works Thursdays.
Maria: I'll call Dr. Mercer's office about the Entresto and your water pill dose this morning. Please don't start Entresto while you're still on lisinopril; the doctor will tell you when to switch. I can book Dr. Mercer for Thursday at 2 and send a ride. Is that OK?
Dorothy: Yes, Thursday is fine.
Maria: If your weight goes up 2 pounds in a day or 5 in a week, or breathing gets harder, call us or 911. I'll call you tomorrow.""",
  cachedBrief=dict(lines=[
    dict(text="Discharged Fri 6 Nov after acute-on-chronic HF (EF 30%); today is day 3 of the 7-day follow-up window.", cites=["ADT-0002", "HIE-1001"]),
    dict(text="New sacubitril/valsartan was never dispensed: pharmacy rejected it Sat for prior authorization (NCPDP 75); no coverage request on file.", cites=["RX-1004", "UM-1001"]),
    dict(text="Lisinopril was STOPPED at discharge but auto-refilled Sat; it must not overlap with sacubitril/valsartan (36-hour washout).", cites=["HIE-1001", "RX-1003"]),
    dict(text="Furosemide was increased to 40 mg, but the last fill is 20 mg; potassium 5.3 and creatinine 1.4 on 6 Nov.", cites=["HIE-1001", "RX-1001", "LAB-1002", "LAB-1003"]),
    dict(text="Home line unanswered twice over the weekend; authorised daughter Karen answers after 18:00. Husband no longer drives.", cites=["AT-1002", "CP-1002", "CN-1001"])],
    questions=["Which bottles are you taking right now? (read the labels)", "Today's weight vs. discharge weight? Swelling or breathlessness?",
               "Has anyone told you to stop lisinopril?", "Who can take you to a visit this week?"]),
  cachedNote=dict(summary="Day-3 post-discharge HF call with member and husband. Taking lisinopril (stopped at discharge, auto-refilled) and furosemide 20 mg (discharge dose 40 mg). Sacubitril/valsartan not started: PA required. Weight 172 lb vs 168 lb at discharge, mild ankle swelling, 2-pillow orthopnoea unchanged. No transport: husband no longer drives.",
    fields=[dict(label="Symptoms", value="Ankle swelling; 2-pillow orthopnoea (baseline); fatigue", source="call"),
            dict(label="Weight trend", value="+4 lb since discharge (168 → 172 lb): flag for prescriber today", source="call"),
            dict(label="Medication reconciliation", value="Lisinopril 10 mg: taking (STOP per HIE-1001) · Furosemide 20 mg: taking (discharge 40 mg) · Metoprolol 50 mg: taking · Sacubitril/valsartan: not started (PA)", source="HIE-1001 · RX-1001 · RX-1003 · RX-1004"),
            dict(label="Education", value="Do not start sacubitril/valsartan with lisinopril; weight rules (+2 lb/day or +5 lb/week); when to call 911", source="call"),
            dict(label="Barriers", value="Transport (husband cannot drive); prior authorization", source="call · CN-1001"),
            dict(label="Follow-up", value="PCP Dr. Mercer Thu 12 Nov 14:00 + plan ride; nurse call Tue 10 Nov", source="call · DIR-0001 · CB-1001")],
    tasks=[dict(task="Call Dr. Mercer: expedited coverage request for sacubitril/valsartan; confirm furosemide 40 mg; lisinopril stop + washout plan; report +4 lb", owner="Maria", due="Today 12:00"),
           dict(task="Ask pharmacy to cancel lisinopril auto-refill", owner="Maria", due="Today"),
           dict(task="Book ride for Thu 12 Nov 13:15 pickup", owner="Maria", due="Today"),
           dict(task="Follow-up call: weight, meds in hand", owner="Maria", due="Tue 10 Nov")]),
))

# ---------------------------------------------------------------- P2
P.append(dict(
  id="P2", member="SYN-M-31876", name="Luis Ortega", age=61, sex="M", plan="Medicare Advantage PPO", program="Rising-risk diabetes",
  pcp="Dr. Priya Nair", language="English on file · prefers Spanish", languageFlag=True, authRep="—", hero=True,
  risk=3, window=1, reach=1.0,
  why=["Metformin 21 days late", "A1c 8.1 → 9.4", "Answers at lunch, in Spanish"],
  nba="Call at 12:30 in Spanish. Explore side effects and cost; loop in PCP",
  scenario="Rising-risk diabetic who quietly stopped one refill",
  contacts=[c("CP-2001", "(312) 555-0163", "Mobile", "Luis (member)", "ELIG", "2024-01-15", "2026-07-14", "Mon/Wed 12:30–13:00", "Yes", "Active", 1, "Answers in Spanish")],
  signals=[
    dict(code="S4", title="Refills lapsing, risk rising", confidence="High · pharmacy + lab trend", measure="Part D diabetes adherence (PDC ≥80%, triple-weighted)",
         mode="Auto-detected · Maria confirms", rule="Refill ≥15 days late or PDC trending <80%, AND A1c up ≥0.5",
         evidence=[ev("RX-2002", "RX", "Metformin ER 1000 mg last filled 19 Sep (30 days): 21 days overdue"),
                   ev("LAB-2002", "LAB", "A1c 9.4% on 22 Oct (was 8.1% in April, LAB-2001)"),
                   ev("RISK-2", "RISK", "PDC year-to-date 0.74, below the 0.80 Star threshold")],
         guards=["Mail-order checked: enrolled, but no metformin shipment pending (only empagliflozin)", "Not hospitalised (no ADT)"],
         actions=["Call Mon/Wed 12:30 in Spanish", "Ask why he stopped: side effects, cost, or confusion", "Message PCP with the reason; ask about alternatives", "Offer 90-day supply once settled"]),
    dict(code="S3", title="Medication lists disagree", confidence="Medium · note vs. fill", measure="Medication reconciliation",
         mode="Auto-flagged · Maria decides", rule="Same drug differs in dose or form across sources",
         evidence=[ev("RX-2002", "RX", "Pharmacy: metformin ER 1000 mg once daily"), ev("HIE-2001", "HIE", "PCP note 22 Oct: 'metformin 500 mg twice daily, stopped ~2 weeks ago (GI upset)'")],
         guards=[], actions=["Confirm on the call which tablets he has", "Send the reconciled list to Dr. Nair"]),
  ],
  suppressed=[],
  conflicts=[dict(topic="Metformin", severity="Check", a=dict(src="RX", rec="RX-2002", value="ER 1000 mg once daily", at="19 Sep"),
                  b=dict(src="HIE", rec="HIE-2001", value="500 mg twice daily, stopped", at="22 Oct"), note="PCP list may be out of date; the reason (GI upset) matters more than the dose."),
             dict(topic="Language", severity="Check", a=dict(src="ELIG", rec="ELIG", value="English", at="enrolment"),
                  b=dict(src="CASE", rec="CN-2001", value="Prefers Spanish for health discussions", at="14 Jul"), note="One click corrects the eligibility record."),
             dict(topic="A1c, two feeds", severity="Resolved", a=dict(src="LAB", rec="LAB-2002", value="9.4 %", at="22 Oct"),
                  b=dict(src="LAB", rec="LAB-2003", value="79 mmol/mol", at="22 Oct"), note="Same test in different units (LOINC 4548-4 vs 59261-8): counted once automatically.")],
  meds=[dict(name="Metformin ER 1000 mg", clinical="PCP: 500 mg BID, stopped", pharmacy="Filled 19 Sep, 30 days", status="21 days overdue", rec="RX-2002"),
        dict(name="Empagliflozin 10 mg", clinical="Continue", pharmacy="Mail order 15 Aug, 90 days", status="OK", rec="RX-2001"),
        dict(name="Atorvastatin 40 mg", clinical="Continue", pharmacy="Filled 25 Oct", status="OK", rec="RX-2003")],
  missing=[dict(what="Urine albumin (kidney health)", expected="Ordered 22 Oct, no result", action="Remind at call")],
  labs=[dict(test="A1c", value="9.4 %", flag="H", at="22 Oct", rec="LAB-2002", note="Arrived 14 days after the draw"),
        dict(test="A1c (earlier)", value="8.1 %", flag="H", at="15 Apr", rec="LAB-2001", note=""),
        dict(test="eGFR", value="68", flag="", at="22 Oct", rec="LAB-2004", note="")],
  gaps=["Part D diabetes adherence: PDC 0.74", "Kidney health evaluation (KED)", "Eye exam"],
  timeline=[dict(at="2026-04-15", src="LAB", rec="LAB-2001", text="A1c 8.1%", received="17 Apr", visible=True),
            dict(at="2026-07-14 12:40", src="CON", rec="AT-2001", text="Call answered (Spanish)", received="14 Jul", visible=True),
            dict(at="2026-09-19", src="RX", rec="RX-2002", text="Last metformin fill (30 days)", received="19 Sep", visible=True),
            dict(at="2026-10-19", src="RX", rec="RX-2002", text="Metformin refill due: not filled", received="—", visible=True),
            dict(at="2026-10-22", src="HIE", rec="HIE-2001", text="PCP visit note: stopped metformin (GI upset)", received="5 Nov (14 days)", visible=True, flag="IMP-P2-02"),
            dict(at="2026-10-22", src="LAB", rec="LAB-2002", text="A1c 9.4% (same result also as 79 mmol/mol)", received="5 Nov", visible=True, flag="IMP-P2-03"),
            dict(at="2026-11-04", src="CLM", rec="CLM-2002", text="Claim for 22 Oct visit received (13 days)", received="4 Nov", visible=True, flag="IMP-P2-04")],
  sources=[["RX", "25 Oct"], ["LAB", "5 Nov"], ["HIE", "5 Nov"], ["CLM", "4 Nov"], ["RISK", "1 Nov"], ["SDOH", "20 Jan (293 days)"]],
  transcript="""Mon 9 Nov 12:35 · Maria calls (312) 555-0163 with a Spanish interpreter.
Maria: Hello Mr. Ortega, it's Maria, your nurse. Is now a good time? Your lunch break?
Luis: Yes, ten minutes.
Maria: I see your metformin hasn't been refilled since September. How is it going with that one?
Luis: I stopped it. My stomach, diarrhea at work. On a construction site it's hard.
Maria: I'm sorry, that sounds really hard. Did you tell Dr. Nair?
Luis: In October, yes. She said maybe another medicine but I didn't hear back.
Maria: Are you still taking the Jardiance and the cholesterol pill?
Luis: Yes, those are fine. The Jardiance comes by mail.
Maria: Sometimes money is tight for food or medicine. How is that for you?
Luis: Food sometimes, end of the month. Medicine is OK.
Maria: I'll send Dr. Nair a message today about other options for your sugar. Also you have a urine test ordered; can you do it this week?
Luis: Friday morning, before work.""",
  cachedBrief=dict(lines=[
    dict(text="Metformin ER 1000 mg last filled 19 Sep; 21 days overdue; year-to-date PDC 0.74 (below 0.80).", cites=["RX-2002", "RISK-2"]),
    dict(text="A1c rose from 8.1% (Apr) to 9.4% (22 Oct).", cites=["LAB-2001", "LAB-2002"]),
    dict(text="PCP note says he stopped metformin about 2 weeks before 22 Oct because of GI upset; the PCP lists 500 mg twice daily, the pharmacy shows ER 1000 mg.", cites=["HIE-2001", "RX-2002"]),
    dict(text="Prefers Spanish (eligibility says English); answers Mon/Wed 12:30–13:00.", cites=["CN-2001", "CP-2001"]),
    dict(text="Self-reported food insecurity 'sometimes' (Jan HRA); urine albumin ordered, no result yet.", cites=["SD-2001", "HIE-2001"])],
    questions=["What happened when you took metformin?", "Did Dr. Nair suggest anything else?", "Are the other two medicines OK?", "Can you do the urine test this week?"]),
  cachedNote=dict(summary="Lunch-break call in Spanish (interpreter). Stopped metformin in October because of diarrhoea at work; told PCP, no follow-up received. Taking empagliflozin (mail order) and atorvastatin. Food insecurity at month-end. Agreed to urine test Friday.",
    fields=[dict(label="Medication reconciliation", value="Metformin: stopped (GI intolerance) · Empagliflozin 10 mg: taking · Atorvastatin 40 mg: taking", source="call · RX-2001 · RX-2002 · RX-2003"),
            dict(label="Adherence barrier", value="Side effects (not cost, not confusion)", source="call"),
            dict(label="Social needs", value="Food insecurity at month-end", source="call · SD-2001"),
            dict(label="Preferred language", value="Spanish: update eligibility record", source="call · CN-2001"),
            dict(label="Care gaps", value="Urine albumin Friday morning (KED)", source="call · HIE-2001")],
    tasks=[dict(task="Message Dr. Nair: GI intolerance to metformin, A1c 9.4%; ask about an alternative", owner="Maria", due="Today"),
           dict(task="Update language preference to Spanish", owner="Maria", due="Today"),
           dict(task="Share food benefit / food bank options", owner="Maria", due="Wed 11 Nov"),
           dict(task="Check urine albumin result", owner="Maria", due="Mon 16 Nov")]),
))

# ---------------------------------------------------------------- P3
P.append(dict(
  id="P3", member="SYN-M-44502", name="Keisha Brown", age=34, sex="F", plan="Medicaid managed care", program="Complex care management · asthma",
  pcp="Dr. Samuel Ortiz", language="English", authRep="—", hero=True,
  risk=4, window=2, reach=0.6,
  why=["3 ED visits in 66 days", "No controller inhaler since June", "New mobile found Saturday"],
  nba="Confirm identity match, call the new mobile midday, stop auto-closure, book PCP",
  scenario="Unreachable frequent ED user with a split identity",
  identity=dict(rec="CG-901455", name="BROWN, KEYSHA", facility="County General", confidence=0.86,
                matchOn=["Date of birth matches (21 Jan 1992)", "Address matches", "Name: 1 letter different (Keysha / Keisha)", "Different hospital MRN (CG-883120 used in Oct)"],
                records=["ADT-0014", "ADT-0015", "HIE-3002"]),
  utr=dict(text="Case set to auto-close as 'unable to reach' on 10 Nov after 4 failed calls and a returned letter.", rec="CN-3001"),
  contacts=[c("CP-3002", "(312) 555-0158", "Mobile", "Keisha (member)", "PBM pharmacy profile", "2026-11-07", "", "Midday (works nights)", "Unknown: ask on first call", "New, untested", 1, "Captured at the 24-h pharmacy after Saturday's ED visit"),
            c("CP-3001", "(312) 555-0119", "Home", "Keisha (member)", "ELIG", "2023-08-01", "2025-12-20", "—", "Unknown", "Disconnected (×4)", 2, "Still 'primary' in eligibility")],
  signals=[
    dict(code="S5", title="A better number exists", confidence="High", measure="Reach rate",
         mode="Auto-detected · Maria calls", rule="≥3 failed attempts on number A AND a newer number in another source",
         evidence=[ev("AT-3005", "CON", "Home line 'not in service' 4 times (12 Oct – 2 Nov)"), ev("CP-3002", "CON", "New mobile in pharmacy profile, 7 Nov")],
         guards=["Text not suggested: no consent on file (ask on first call)"],
         actions=["Call (312) 555-0158 midday", "Ask for text consent and best time", "Pause the 'unable to reach' auto-closure"]),
    dict(code="S6", title="ED used as primary care", confidence="High once identity confirmed", measure="AMR asthma medication ratio (0.27 vs ≥0.50)",
         mode="Auto-detected · Maria confirms", rule="≥3 ED visits in 90 days AND no PCP visit in 6 months",
         evidence=[ev("ADT-0010", "ADT", "ED Riverside 2 Sep"), ev("ADT-0012", "ADT", "ED County General 4 Oct"),
                   ev("ADT-0014", "ADT", "ED County General 7 Nov (new MRN: confirm match)"), ev("CLM-3000", "CLM", "Last PCP visit 12 Mar"),
                   ev("RX-3006", "RX", "5 albuterol rescue inhalers in 80 days; controller last filled 2 Jun")],
         guards=["Claims show only 1 of 3 visits: ED count taken from ADT"],
         actions=["Book PCP within 7 days using the HiLabs-verified number (312) 555-0125", "Controller inhaler refill + asthma action plan", "Ask what happens at night (ED vs urgent care)"]),
  ],
  suppressed=[],
  conflicts=[dict(topic="PCP phone", severity="Check", a=dict(src="DIR", rec="DIR-0003", value="(312) 555-0124 Westside Clinic (plan directory)", at="—"),
                  b=dict(src="DIR", rec="DIR-0003", value="Moved: (312) 555-0125 (HiLabs verification 30 Oct)", at="30 Oct"), note="Use the verified number."),
             dict(topic="ED visits", severity="Check", a=dict(src="CLM", rec="CLM-3001", value="1 ED visit in claims", at="19 Oct"),
                  b=dict(src="ADT", rec="ADT-0014", value="3 ED visits in ADT", at="7 Nov"), note="Claims lag; ADT is the timely truth.")],
  meds=[dict(name="Budesonide/formoterol (controller)", clinical="Daily", pharmacy="Last filled 2 Jun", status="5 months without", rec="RX-3001"),
        dict(name="Albuterol HFA (rescue)", clinical="As needed", pharmacy="5 fills in 80 days", status="Overuse", rec="RX-3006"),
        dict(name="Prednisone 40 mg × 5 days", clinical="ED 7 Nov", pharmacy="Filled 7 Nov", status="OK", rec="RX-3006")],
  missing=[dict(what="Health risk assessment", expected="Never completed", action="Complete on first call"),
           dict(what="ED claims for 4 Oct and 7 Nov", expected="~20 Nov / ~10 Dec", action="None: ADT covers them")],
  labs=[],
  gaps=["AMR 0.27 (target ≥0.50)", "No PCP visit since March"],
  timeline=[dict(at="2026-03-12", src="CLM", rec="CLM-3000", text="Last primary-care visit (Eastside Clinic)", received="30 Mar", visible=True),
            dict(at="2026-06-02", src="RX", rec="RX-3001", text="Last controller inhaler fill", received="2 Jun", visible=True),
            dict(at="2026-09-02 01:15", src="ADT", rec="ADT-0010", text="ED visit, Riverside (shortness of breath)", received="2 Sep", visible=True),
            dict(at="2026-10-04 23:50", src="ADT", rec="ADT-0012", text="ED visit, County General (asthma)", received="5 Oct", visible=True),
            dict(at="2026-10-12 10:05", src="CON", rec="AT-3001", text="Home line not in service (1 of 4)", received="12 Oct", visible=True, flag="IMP-P3-02"),
            dict(at="2026-11-02 16:10", src="CON", rec="AT-3005", text="4th failure; case flagged for auto-closure", received="2 Nov", visible=True, flag="IMP-P3-05"),
            dict(at="2026-11-07 02:30", src="ADT", rec="ADT-0014", text="ED visit, County General, NEW MRN 'BROWN, KEYSHA'", received="7 Nov", visible=True, flag="IMP-P3-01"),
            dict(at="2026-11-07 07:40", src="RX", rec="RX-3006", text="Albuterol + prednisone; pharmacy captured new mobile", received="7 Nov", visible=True),
            dict(at="2026-11-20", src="CLM", rec="CLM-3002", text="4 Oct ED claim expected", received="expected ~20 Nov", visible=False, flag="IMP-P3-03")],
  sources=[["ADT", "7 Nov"], ["RX", "7 Nov"], ["HIE", "7 Nov"], ["CON", "7 Nov"], ["CLM", "19 Oct (2 visits missing)"], ["DIR", "30 Oct"], ["SDOH", "none on file"]],
  transcript="""Mon 9 Nov 12:10 · Maria calls new mobile (312) 555-0158.
Maria: Hi, is this Keisha Brown? This is Maria, a nurse with your Medicaid plan.
Keisha: Yeah. How'd you get this number?
Maria: The pharmacy had it from Saturday. Your old number stopped working, so I'm glad we found you. Is it OK if I text you here too?
Keisha: Yeah, texts are better. I work nights at the warehouse.
Maria: I saw you were in the ER Saturday for your asthma. How's your breathing today?
Keisha: Better with the steroid. I've been using the blue inhaler every day.
Maria: What about the purple one, the daily controller?
Keisha: Ran out in the summer. I thought it cost money.
Maria: On your plan it's $0. Can I ask Dr. Ortiz's office for a refill and a visit? They moved, I have the new number.
Keisha: OK. Afternoons, after I sleep. Video is fine.
Maria: Where do you go when it gets bad at night?
Keisha: The ER. Nothing else is open.""",
  cachedBrief=dict(lines=[
    dict(text="3 ED visits for asthma in 66 days (2 Sep, 4 Oct, 7 Nov); the 7 Nov visit is filed under a new MRN with the name spelled 'Keysha' (match 0.86).", cites=["ADT-0010", "ADT-0012", "ADT-0014"]),
    dict(text="5 albuterol rescue fills in 80 days and no controller since 2 Jun.", cites=["RX-3006", "RX-3001"]),
    dict(text="Home number disconnected (4 attempts); pharmacy captured a new mobile on 7 Nov. No text consent on file.", cites=["AT-3005", "CP-3002"]),
    dict(text="Last PCP visit 12 Mar; the PCP clinic moved: verified number (312) 555-0125.", cites=["CLM-3000", "DIR-0003"]),
    dict(text="Case is set to auto-close as 'unable to reach' on 10 Nov.", cites=["CN-3001"])],
    questions=["Is this the best number? OK to text?", "How often are you using the rescue inhaler?", "What happened to the daily inhaler?", "Where do you go when it's bad at night?"]),
  cachedNote=dict(summary="First successful contact via new mobile. Works nights; prefers texts. Using rescue inhaler daily; controller ran out in summer (believed it had a cost; $0 on plan). Goes to ED at night because nothing else is open. Agreed to PCP video visit and controller refill.",
    fields=[dict(label="Contact", value="New mobile confirmed as primary; text consent given (verbal)", source="call · CP-3002"),
            dict(label="Asthma control", value="Daily rescue use; controller lapsed since June", source="call · RX-3001 · RX-3006"),
            dict(label="Barrier", value="Cost misunderstanding; night-shift schedule; no after-hours option", source="call"),
            dict(label="Plan", value="PCP video visit (afternoon) via verified number; controller refill; asthma action plan; 24/7 nurse line and urgent-care info", source="call · DIR-0003")],
    tasks=[dict(task="Confirm HIE identity match CG-901455", owner="Maria", due="Today"),
           dict(task="Cancel 'unable to reach' auto-closure; update primary phone", owner="Maria", due="Today"),
           dict(task="Book PCP video visit (afternoon) + controller refill", owner="Maria", due="Tue 10 Nov"),
           dict(task="Text 24/7 nurse line and urgent care options", owner="Maria", due="Today")]),
))

# ---------------------------------------------------------------- P4
P.append(dict(
  id="P4", member="SYN-M-52990", name="Marcus Reed", age=47, sex="M", plan="Medicaid managed care", program="Complex CM · behavioral health co-managed",
  pcp="Dr. Helen Brooks", language="English", authRep="—", hero=True,
  risk=4, window=3, reach=0.65,
  why=["FUH 7-day window closes Wed", "Shelter; prepaid phone", "Meds run out 18 Nov"],
  nba="Text first, loop in BH counsellor, book Tue 15:00 tele slot, get shelter release",
  scenario="Behavioral-health discharge to a shelter, FUH clock running",
  fuh=dict(discharged="Wed 4 Nov", closes="Wed 11 Nov", slot="Tue 10 Nov 15:00 · Riverside BH (telehealth), verified 3 Nov"),
  consentGate=dict(rec="BH-4002", text="1 behavioral-health record from a 42 CFR Part 2 program exists. No consent on file, so its content is hidden.", action="Discuss consent only if Marcus wants care coordinated with that program."),
  contacts=[c("CP-4001", "(312) 555-0131", "Prepaid mobile", "Marcus (member)", "ELIG", "2026-02-11", "2026-08-14", "Texts answered faster", "Yes (HRA 02/2026)", "Rings out / voicemail full", 1, "Prepaid minutes run out"),
            c("CP-4002", "(312) 555-0176", "Office", "Harbor Light Shelter case worker", "CBO", "2026-11-05", "", "Business hours", "n/a", "Locked: no release of information", 2, "Cannot share health information until Marcus signs a release")],
  signals=[
    dict(code="S7", title="Social need blocking care", confidence="High", measure="FUH 7-day (closes Wed 11 Nov) · SNS-E",
         mode="Auto-detected · Maria confirms", rule="Housing flag + missed visits, OR social screen >6 months old at a new event",
         evidence=[ev("ADT-0021", "ADT", "Discharged 4 Nov; address: Harbor Light Shelter"), ev("SD-4001", "SDOH", "Feb HRA: 'stable housing' (271 days old)"),
                   ev("CN-4001", "CASE", "2 psychiatry no-shows (10 Sep, 8 Oct)"), ev("HIE-4001", "HIE", "Follow-up 'to be arranged'; Z59.01 sheltered homelessness")],
         guards=["Content of Part 2 record not used (no consent)"],
         actions=["Text first (consent on file), then call", "Offer the verified tele slot Tue 10 Nov 15:00 (inside the FUH window)",
                  "Ask Marcus to sign a release for the shelter case worker", "Re-screen housing; update address", "Ask prescriber for a 30-day aripiprazole refill before 18 Nov"]),
  ],
  suppressed=[],
  conflicts=[dict(topic="Address / housing", severity="Check", a=dict(src="ELIG", rec="ELIG", value="418 Synthetic Ave Apt 2 · HRA: 'stable'", at="Feb"),
                  b=dict(src="ADT", rec="ADT-0021", value="Harbor Light Shelter, 88 Synthetic Ave", at="4 Nov"), note="Newer event wins; prompt re-screen.")],
  meds=[dict(name="Aripiprazole 15 mg", clinical="Daily (discharge)", pharmacy="14 days filled 4 Nov", status="Runs out 18 Nov", rec="RX-4002"),
        dict(name="Lisinopril 20 mg", clinical="Blood pressure", pharmacy="Last filled 2 Jul", status="Lapsed since Aug", rec="RX-4001")],
  missing=[dict(what="Outpatient psychiatry appointment", expected="'To be arranged'", action="Book Tue 10 Nov 15:00"),
           dict(what="Release of information for shelter", expected="Not signed", action="Ask on call")],
  labs=[],
  gaps=["FUH 7-day due Wed 11 Nov", "FUH 30-day due 4 Dec", "SNS-E social need screening"],
  timeline=[dict(at="2026-09-10", src="CASE", rec="CN-4001", text="Psychiatry no-show (1 of 2)", received="8 Oct", visible=True),
            dict(at="2026-10-08", src="CASE", rec="CN-4001", text="Psychiatry no-show (2 of 2); possibly lost housing", received="8 Oct", visible=True),
            dict(at="2026-10-28 16:00", src="ADT", rec="ADT-0020", text="Admitted, Riverside Behavioral Health", received="28 Oct", visible=True),
            dict(at="2026-11-04 11:30", src="ADT", rec="ADT-0021", text="Discharged; address is a shelter", received="4 Nov", visible=True, flag="IMP-P4-01"),
            dict(at="2026-11-04 13:00", src="RX", rec="RX-4002", text="Aripiprazole, 14-day supply", received="4 Nov", visible=True),
            dict(at="2026-11-06 10:00", src="HIE", rec="HIE-4001", text="Discharge summary: follow-up 'to be arranged'", received="6 Nov", visible=True, flag="IMP-P4-04"),
            dict(at="2026-11-06 15:05", src="CON", rec="AT-4003", text="Callback text sent; no reply yet", received="6 Nov", visible=True, flag="IMP-P4-02"),
            dict(at="2026-12-01", src="CLM", rec="CLM-4002", text="Inpatient psych claim expected", received="expected ~1 Dec", visible=False)],
  sources=[["ADT", "4 Nov"], ["HIE", "6 Nov"], ["RX", "4 Nov"], ["CON", "6 Nov"], ["BH", "consent-gated"], ["SDOH", "11 Feb (271 days)"], ["CLM", "2 Sep (stay not billed)"]],
  transcript="""Mon 9 Nov 10:40 · Marcus calls back from the shelter's phone after Maria's 9:15 text.
Marcus: You texted? My phone's out of minutes.
Maria: Thanks for calling back, Marcus. I'm Maria, your nurse. How are you doing since you left Riverside?
Marcus: Tired. Sleeping badly in the shelter, it's loud.
Maria: Before we go on, I ask everyone this: any thoughts of hurting yourself?
Marcus: No. Not like before.
Maria: Good, thank you for telling me. You're supposed to see a psychiatrist this week. There's a video slot Tuesday at 3. Could you do that?
Marcus: The shelter has a quiet room. Tuesday works.
Maria: Can I talk with your shelter case worker to help with rides and reminders? You'd need to sign a release.
Marcus: Yeah, she's OK. I'll sign.
Maria: Your aripiprazole runs out on the 18th. I'll ask for a refill. And your blood pressure pill, are you taking it?
Marcus: Not since summer.""",
  cachedBrief=dict(lines=[
    dict(text="Discharged Wed 4 Nov from Riverside Behavioral Health to Harbor Light Shelter; the FUH 7-day window closes Wed 11 Nov and nothing is booked.", cites=["ADT-0021", "HIE-4001"]),
    dict(text="A verified telehealth slot exists Tue 10 Nov 15:00 at Riverside BH.", cites=["DIR-0004"]),
    dict(text="Aripiprazole 15 mg: 14-day supply filled 4 Nov, runs out 18 Nov. Lisinopril lapsed since August.", cites=["RX-4002", "RX-4001"]),
    dict(text="Prepaid phone often out of minutes; text consent on file; shelter case worker known but no release signed.", cites=["CP-4001", "CP-4002"]),
    dict(text="Two psychiatry no-shows (Sep, Oct); housing screen from Feb says 'stable' and is out of date.", cites=["CN-4001", "SD-4001"])],
    questions=["How are you doing since discharge? (safety check)", "Can you do a video visit Tue at 15:00?", "OK to involve the shelter case worker?", "Do you have enough medicine?"]),
  cachedNote=dict(summary="Member called back from shelter phone after text. Sleeping poorly; denies thoughts of self-harm. Agreed to FUH telehealth visit Tue 10 Nov 15:00 from shelter quiet room. Agreed to sign release for shelter case worker. Aripiprazole runs out 18 Nov. Not taking lisinopril since summer.",
    fields=[dict(label="Safety screen", value="Denies thoughts of self-harm", source="call"),
            dict(label="Follow-up (FUH 7-day)", value="Riverside BH telehealth Tue 10 Nov 15:00", source="call · DIR-0004"),
            dict(label="Housing", value="Sheltered: Harbor Light Shelter (update address; re-screen done)", source="call · ADT-0021"),
            dict(label="Consent", value="Verbal agreement to release for shelter case worker: written form needed", source="call"),
            dict(label="Medications", value="Aripiprazole: taking, supply ends 18 Nov · Lisinopril: not taking since summer", source="call · RX-4001 · RX-4002")],
    tasks=[dict(task="Book FUH visit Tue 10 Nov 15:00 and text reminder", owner="Maria", due="Today"),
           dict(task="Send release-of-information form to shelter for signature", owner="BH counsellor", due="Tue 10 Nov"),
           dict(task="Request 30-day aripiprazole refill before 18 Nov", owner="Maria", due="Wed 11 Nov"),
           dict(task="Flag blood-pressure med lapse to PCP Dr. Brooks", owner="Maria", due="This week")]),
))

# ---------------------------------------------------------------- P5
P.append(dict(
  id="P5", member="SYN-M-60733", name="Margaret O'Neill", age=84, sex="F", plan="D-SNP (dual eligible)", program="Complex CM · dementia, AF, CKD",
  pcp="Dr. Grace Liu", language="English", authRep="Linda O'Neill (daughter), POA", hero=True,
  risk=4, window=2, reach=0.9,
  why=["ED fall Sat on an anticoagulant", "Home-health auth pending 90 h", "Caregiver strain noted twice"],
  nba="Call Linda after 7 pm: confirm apixaban 2.5 mg, escalate auth, offer respite",
  scenario="Senior after a fall; caregiver near breaking point; one false-alarm trap",
  contacts=[c("CP-5002", "(312) 555-0194", "Mobile", "Linda O'Neill, daughter (POA)", "CASE", "2024-06-01", "2026-11-02", "After 19:00", "Yes", "Active", 1, ""),
            c("CP-5001", "(312) 555-0105", "Home", "Margaret (member)", "ELIG", "2018-02-01", "2026-09-03", "—", "n/a", "Member confused on calls", 2, "Prefer the daughter")],
  signals=[
    dict(code="S8", title="Caregiver under strain", confidence="Medium · AI-flagged from free text", measure="Readmission risk · caregiver support",
         mode="AI flag · Maria confirms", rule="Strain language in ≥2 notes AND caregiver is the sole support",
         evidence=[ev("CN-5001", "CASE", "12 Oct: 'I can't keep up with the nights.'"), ev("CN-5002", "CASE", "2 Nov: sounds exhausted; missed work twice; asked about adult day programmes"),
                   ev("HIE-5001", "HIE", "ED note 7 Nov: daughter says she 'can't keep up'")],
         guards=["HRA has no caregiver question, so the signal comes only from notes (shown with dates)"],
         actions=["Ask Linda how she is doing (caregiver check-in)", "Offer adult day programme referral (Medicaid HCBS)", "Ask home health about night support"]),
    dict(code="S3", title="Medication lists disagree", confidence="High", measure="Medication safety",
         mode="Auto-flagged · Maria decides", rule="Same drug differs in dose across sources",
         evidence=[ev("HIE-5001", "HIE", "ED list: apixaban 5 mg twice daily (from an old paper list)"), ev("RX-5001", "RX", "Pharmacy: apixaban 2.5 mg twice daily"),
                   ev("CLM-5002", "CLM", "12 Aug PCP visit where the dose was reduced"), ev("LAB-5001", "LAB", "Creatinine 1.6; age 84; weight 57 kg: 2.5 mg is the correct dose")],
         guards=["Dose criteria checked: 3 of 3 met (age ≥80, weight ≤60 kg, creatinine ≥1.5)"],
         actions=["Confirm with Linda which tablets she gives (2.5 mg)", "Send the corrected list to Dr. Liu and the ED record"]),
    dict(code="S2", title="Authorisation stuck", confidence="High", measure="FMC: follow-up within 7 days of ED visit (by 14 Nov)",
         mode="Auto-detected · Maria escalates", rule="Home-health authorisation pending >72 h, or no follow-up booked after an ED visit",
         evidence=[ev("UM-5001", "UM", "Home-health recertification requested Thu 5 Nov 14:00: pending 90 h (7-day clock ends Thu 12 Nov)"),
                   ev("ADT-0031", "ADT", "ED discharge Sat 7 Nov after a fall")],
         guards=[], actions=["Ask UM to expedite after the fall", "Book PCP within 7 days of the ED visit (by Sat 14 Nov)", "Request a home-safety check"]),
  ],
  suppressed=[dict(code="S4", title="Refill lapse: apixaban", reason="NOT ALERTED. Retail data says apixaban is 30 days overdue, but Margaret is enrolled in mail order since October and the 90-day shipment (8 Oct) arrives in the 10 Nov mail-order batch.",
                   evidence=[ev("RX-5001", "RX", "Last retail fill 10 Sep (30 days)"), ev("ELIG", "ELIG", "Mail-order enrolled since Oct 2026")],
                   instead="Shown as a 'confirm on the call' question instead of an alarm.")],
  conflicts=[dict(topic="Apixaban dose", severity="Check", a=dict(src="HIE", rec="HIE-5001", value="5 mg twice daily (ED list)", at="7 Nov"),
                  b=dict(src="RX", rec="RX-5001", value="2.5 mg twice daily (pharmacy, PCP Aug)", at="10 Sep"), note="2.5 mg is correct: she meets all 3 dose-reduction criteria."),
             dict(topic="Caregiver support", severity="Stale", a=dict(src="SDOH", rec="SD-5001", value="HRA: no needs (no caregiver question)", at="5 Apr"),
                  b=dict(src="CASE", rec="CN-5002", value="Daughter exhausted, missing work", at="2 Nov"), note="Instrument gap: add the question on the call.")],
  meds=[dict(name="Apixaban", clinical="ED list: 5 mg BID", pharmacy="2.5 mg BID (retail 10 Sep; mail-order 90 days 8 Oct, arriving in feed 10 Nov)", status="Dose conflict · refill OK", rec="RX-5001"),
        dict(name="Donepezil 5 mg", clinical="Nightly", pharmacy="Mail order 8 Oct, 90 days", status="OK (in 10 Nov batch)", rec="RX-5003")],
  missing=[dict(what="Mail-order pharmacy batch (Oct)", expected="Arrives 10 Nov", action="Confirm refill on the call; no alert"),
           dict(what="Home-health decision", expected="Due Thu 12 Nov", action="Ask to expedite")],
  labs=[dict(test="Creatinine", value="1.6 mg/dL", flag="H", at="12 Aug", rec="LAB-5001", note=""), dict(test="eGFR", value="31", flag="L", at="12 Aug", rec="LAB-5002", note="CKD 3b")],
  gaps=["FMC: follow-up within 7 days of ED visit (by 14 Nov)", "Caregiver support"],
  timeline=[dict(at="2026-08-12", src="CLM", rec="CLM-5002", text="PCP reduced apixaban to 2.5 mg", received="26 Aug", visible=True),
            dict(at="2026-09-10", src="RX", rec="RX-5001", text="Last retail apixaban fill (30 days)", received="10 Sep", visible=True, flag="IMP-P5-02"),
            dict(at="2026-10-12 19:30", src="CASE", rec="CN-5001", text="Linda: 'I can't keep up with the nights.'", received="12 Oct", visible=True, flag="IMP-P5-03"),
            dict(at="2026-11-02 19:30", src="CASE", rec="CN-5002", text="Linda exhausted; asked about adult day programmes", received="2 Nov", visible=True, flag="IMP-P5-03"),
            dict(at="2026-11-05 14:00", src="UM", rec="UM-5001", text="Home-health recertification requested", received="5 Nov", visible=True, flag="IMP-P5-05"),
            dict(at="2026-11-07 19:20", src="ADT", rec="ADT-0030", text="ED visit: fall at home", received="7 Nov", visible=True),
            dict(at="2026-11-08 07:40", src="HIE", rec="HIE-5001", text="ED note: head CT negative; med list says apixaban 5 mg", received="8 Nov", visible=True, flag="IMP-P5-01"),
            dict(at="2026-11-10", src="RX", rec="RX-5002", text="Mail-order batch: apixaban 90 days shipped 8 Oct", received="expected 10 Nov", visible=False, flag="IMP-P5-02")],
  sources=[["ADT", "8 Nov"], ["HIE", "8 Nov"], ["RX", "10 Sep retail · mail-order batch due 10 Nov"], ["UM", "5 Nov"], ["CASE", "2 Nov"], ["SDOH", "5 Apr (218 days)"]],
  transcript="""Mon 9 Nov 19:10 · Maria calls Linda (312) 555-0194.
Maria: Hi Linda, it's Maria. How is your mum after Saturday's fall?
Linda: Sore, a few stitches. The scan was fine, thank God.
Maria: I want to check her blood thinner. The ER list says 5 milligrams. What tablets do you give her?
Linda: The 2.5s. Dr. Liu lowered it in August. The ER copied her old list.
Maria: And did her refill come? The pharmacy shows the last one in September.
Linda: The mail-order box came early October, three months' worth.
Maria: Good. The home nurse visits: are they still coming?
Linda: They stopped. They said the approval is pending.
Maria: I'll push on that today. And how are you doing, Linda?
Linda: Honestly? I'm not sleeping. She's up three, four times a night. I missed work twice last week.
Maria: That's a lot to carry alone. There's an adult day programme her Medicaid covers. Want me to start a referral?
Linda: Yes. Please.
Maria: Can you bring her to Dr. Liu on Thursday morning?
Linda: Thursday at 10:30 works.""",
  cachedBrief=dict(lines=[
    dict(text="ED visit Sat 7 Nov after a fall; head CT negative; she takes an anticoagulant.", cites=["ADT-0030", "HIE-5001"]),
    dict(text="The ED list says apixaban 5 mg twice daily; pharmacy and the Aug PCP visit say 2.5 mg, which matches her age 84, 57 kg, creatinine 1.6.", cites=["HIE-5001", "RX-5001", "CLM-5002", "LAB-5001"]),
    dict(text="Retail data shows no apixaban since 10 Sep, but she is enrolled in mail order: confirm the October shipment before assuming a lapse.", cites=["RX-5001"]),
    dict(text="Home-health recertification pending 90 h (requested 5 Nov).", cites=["UM-5001"]),
    dict(text="Daughter Linda (POA) reported strain twice ('can't keep up') and asked about adult day programmes; best after 19:00.", cites=["CN-5001", "CN-5002", "CP-5002"])],
    questions=["Which apixaban tablets do you give her? (2.5 or 5 mg)", "Did the mail-order box arrive in October?", "Are home-health visits still happening?", "How are YOU doing, Linda?"]),
  cachedNote=dict(summary="Evening call with daughter/POA. Fall Sat: laceration, CT negative. Giving apixaban 2.5 mg BID (ED list wrong). Mail-order 90-day supply arrived early Oct (no lapse). Home-health visits stopped pending authorisation. Linda reports severe sleep loss, missed work; accepts adult day referral. PCP Thu 12 Nov 10:30.",
    fields=[dict(label="Medication reconciliation", value="Apixaban 2.5 mg BID confirmed (ED list 5 mg is wrong) · Donepezil 5 mg nightly", source="call · RX-5001 · HIE-5001"),
            dict(label="Refill status", value="Mail-order 90-day supply received early Oct: no lapse", source="call"),
            dict(label="Fall", value="Scalp laceration repaired; CT negative; request home-safety check", source="HIE-5001 · call"),
            dict(label="Caregiver check-in", value="Severe sleep loss; missed work twice; accepts adult day referral", source="call · CN-5002"),
            dict(label="Follow-up (FMC)", value="Dr. Liu Thu 12 Nov 10:30", source="call")],
    tasks=[dict(task="Ask UM to expedite home-health recertification (post-fall)", owner="Maria", due="Today"),
           dict(task="Send corrected apixaban dose to Dr. Liu and ED", owner="Maria", due="Tue 10 Nov"),
           dict(task="Adult day programme referral (Medicaid HCBS)", owner="Maria", due="Wed 11 Nov"),
           dict(task="Confirm PCP visit Thu 12 Nov 10:30", owner="Maria", due="Wed 11 Nov")]),
))

# ---------------------------------------------------------------- supporting
def sup(id, member, name, age, sex, plan, program, pcp, lang, risk, window, reach, why, nba, scenario, contacts, timeline, meds, sources):
    return dict(id=id, member=member, name=name, age=age, sex=sex, plan=plan, program=program, pcp=pcp, language=lang, authRep="—", hero=False,
                risk=risk, window=window, reach=reach, why=why, nba=nba, scenario=scenario, contacts=contacts, signals=[], suppressed=[], conflicts=[],
                meds=meds, missing=[], labs=[], gaps=[], timeline=timeline, sources=sources)

P += [
  sup("S7", "SYN-M-72251", "Ana Lima", 29, "F", "Medicaid managed care", "Maternity · high risk", "Dr. Rosa Diaz", "Portuguese", 3, 1, 0.9,
      ["32 weeks; Friday visit already rebooked", "BP log check", "Answers mornings (Portuguese)"], "Routine: confirm Tue visit, review home BP log",
      "Supporting: high-risk pregnancy, visit already rebooked by the clinic",
      [c("CP-7001", "(312) 555-0166", "Mobile", "Ana (member)", "ELIG", "2026-02-01", "2026-10-24", "Mornings · Portuguese", "Yes", "Active", 1)],
      [dict(at="2026-10-23", src="CLM", rec="CLM-7001", text="Prenatal visit (high-risk supervision)", received="3 Nov", visible=True),
       dict(at="2026-11-06 15:30", src="CASE", rec="CN-7001", text="Clinic: missed Fri visit rebooked Tue 10 Nov 10:00", received="6 Nov", visible=True)],
      [dict(name="Aspirin 81 mg", clinical="Daily", pharmacy="Filled 15 Oct", status="OK", rec="RX-7001")], [["CLM", "3 Nov"], ["RX", "15 Oct"], ["CASE", "6 Nov"]]),
  sup("S9", "SYN-M-74490", "Grace Owusu", 58, "F", "Medicare Advantage HMO", "Complex CM · CKD stage 4", "Dr. Grace Liu", "English", 3, 1, 0.8,
      ["Nephrology visit 17 Nov", "Ride to confirm", "Often at education sessions"], "Confirm ride for 17 Nov nephrology visit",
      "Supporting: CKD stage 4, dialysis planning",
      [c("CP-9001", "(312) 555-0181", "Home", "Grace (member)", "ELIG", "2021-05-01", "2026-10-13", "Afternoons", "n/a", "Active, missed ×1", 1)],
      [dict(at="2026-10-12", src="LAB", rec="LAB-9001", text="eGFR 22 (CKD 4)", received="14 Oct", visible=True),
       dict(at="2026-10-13 15:00", src="CASE", rec="CN-9001", text="Dialysis options visit 17 Nov; needs a ride", received="13 Oct", visible=True)],
      [dict(name="Sevelamer 800 mg", clinical="With meals", pharmacy="Filled 30 Oct", status="OK", rec="RX-9001")], [["LAB", "14 Oct"], ["RX", "30 Oct"], ["CASE", "13 Oct"]]),
  sup("S6", "SYN-M-71104", "Walter Kim", 71, "M", "Medicare Advantage HMO", "Disease management · COPD", "Dr. Alan Mercer", "English", 2, 1, 1.0,
      ["Routine monthly touch", "Inhaler on time", "No ED since Feb"], "Routine check-in this week", "Supporting: stable COPD",
      [c("CP-6001", "(312) 555-0151", "Home", "Walter (member)", "ELIG", "2020-03-01", "2026-10-06", "Mornings", "n/a", "Active", 1)],
      [dict(at="2026-10-05", src="CLM", rec="CLM-6001", text="PCP visit (COPD)", received="20 Oct", visible=True),
       dict(at="2026-10-28", src="RX", rec="RX-6001", text="Tiotropium filled on time", received="28 Oct", visible=True)],
      [dict(name="Tiotropium", clinical="Daily", pharmacy="Filled 28 Oct", status="OK", rec="RX-6001")], [["CLM", "20 Oct"], ["RX", "28 Oct"]]),
  sup("S8", "SYN-M-73318", "Frank Dobbs", 66, "M", "Medicare Advantage PPO", "Transitions of care · orthopaedics", "Dr. Priya Nair", "English", 2, 1, 1.0,
      ["Home health approved", "PT going well", "Clot-prevention course ends 22 Nov"], "No action today", "Supporting: post hip replacement",
      [c("CP-8001", "(312) 555-0172", "Mobile", "Frank (member)", "ELIG", "2022-09-01", "2026-10-28", "Afternoons", "Yes", "Active", 1)],
      [dict(at="2026-10-15", src="CLM", rec="CLM-8001", text="Hip replacement stay", received="2 Nov", visible=True),
       dict(at="2026-10-18", src="UM", rec="UM-8001", text="Home health PT approved", received="18 Oct", visible=True)],
      [dict(name="Apixaban 2.5 mg (35-day post-op)", clinical="Twice daily", pharmacy="Filled 18 Oct", status="OK", rec="RX-8001")], [["CLM", "2 Nov"], ["UM", "25 Oct"], ["RX", "18 Oct"]]),
  sup("S10", "SYN-M-75562", "Henry Walsh", 80, "M", "Medicare Advantage HMO", "Disease management · heart failure", "Dr. Alan Mercer", "English", 2, 1, 0.8,
      ["Weights stable 6 weeks", "Entresto filled on time", "Routine monthly call"], "Routine check-in; weight log", "Supporting: stable heart failure (the contrast case to Dorothy)",
      [c("CP-1101", "(312) 555-0189", "Home", "Henry (member)", "ELIG", "2019-01-01", "2026-10-12", "Late morning", "n/a", "Active, missed ×1", 1)],
      [dict(at="2026-09-20", src="CLM", rec="CLM-1101", text="Cardiology visit", received="2 Oct", visible=True),
       dict(at="2026-10-30", src="RX", rec="RX-1101", text="Sacubitril/valsartan filled on time", received="30 Oct", visible=True)],
      [dict(name="Sacubitril/valsartan 49/51 mg", clinical="Twice daily", pharmacy="Filled 30 Oct", status="OK", rec="RX-1101")], [["CLM", "2 Oct"], ["RX", "30 Oct"]]),
]

# extra record ids referenced but not on timeline (for citation validation)
EXTRA = {"P1": ["RX-1001", "RX-1002", "UM-1001", "LAB-1001", "LAB-1002", "LAB-1003", "CP-1001", "CP-1002", "CN-1001", "DIR-0001", "CB-1001", "CB-1002", "SD-1001", "AT-1001", "AT-1002"],
         "P2": ["RX-2001", "RX-2002", "RX-2003", "LAB-2001", "LAB-2002", "LAB-2003", "LAB-2004", "CN-2001", "CP-2001", "SD-2001", "RISK-2", "HIE-2001", "CLM-2002", "AT-2001"],
         "P3": ["ADT-0010", "ADT-0011", "ADT-0012", "ADT-0013", "ADT-0014", "ADT-0015", "HIE-3001", "HIE-3002", "RX-3001", "RX-3006", "CP-3001", "CP-3002", "AT-3005", "CLM-3000", "CLM-3001", "DIR-0003", "CN-3001"],
         "P4": ["ADT-0020", "ADT-0021", "HIE-4001", "RX-4001", "RX-4002", "CP-4001", "CP-4002", "CN-4001", "CN-4002", "SD-4001", "DIR-0004", "BH-4001", "AT-4003"],
         "P5": ["ADT-0030", "ADT-0031", "HIE-5001", "RX-5001", "RX-5003", "CLM-5002", "LAB-5001", "LAB-5002", "UM-5001", "CN-5001", "CN-5002", "CP-5001", "CP-5002", "SD-5001", "CB-5001"]}
for p in P:
    ids = set(EXTRA.get(p["id"], []))
    for t in p["timeline"]: ids.add(t["rec"])
    for s in p.get("signals", []): ids.update(e["rec"] for e in s["evidence"])
    for m in p.get("meds", []): ids.add(m["rec"])
    p["recordIds"] = sorted(ids)
    p["score"] = round(p["risk"] * p["window"] * p["reach"], 1)

P.sort(key=lambda p: -p["score"])
for i, p in enumerate(P, 1): p["rank"] = i
assert [p["id"] for p in P[:5]] == ["P1", "P4", "P5", "P3", "P2"], [p["id"] for p in P]

FLAWS = [
 ("IMP-P1-01", "P1", "Duplicate ADT discharge message", "Merged; one task"), ("IMP-P1-02", "P1", "Stopped lisinopril auto-refilled", "S3 unsafe-combination flag"),
 ("IMP-P1-03", "P1", "Entresto rejected (NCPDP 75), no coverage request", "Reason shown; expedited route suggested"), ("IMP-P1-04", "P1", "Admission not in claims until ~4 Dec", "Ranked #1 from ADT + HIE anyway"),
 ("IMP-P1-05", "P1", "HRA 'spouse drives' is stale", "Newer note wins; ride offered"),
 ("IMP-P2-01", "P2", "Language on file wrong", "Spanish shown; one-click correction"), ("IMP-P2-02", "P2", "Metformin dose differs: pharmacy vs PCP", "Side-by-side conflict"),
 ("IMP-P2-03", "P2", "A1c in two units; late", "Counted once (LOINC)"), ("IMP-P2-04", "P2", "Visit claim 13 days late", "HIE note used first"),
 ("IMP-P3-01", "P3", "New MRN, name spelled 'Keysha'", "Match 0.86; Maria confirms"), ("IMP-P3-02", "P3", "Home number dead; new mobile in pharmacy", "New number ranked first"),
 ("IMP-P3-03", "P3", "Claims show 1 of 3 ED visits", "ED count from ADT"), ("IMP-P3-04", "P3", "PCP clinic moved; directory outdated", "HiLabs-verified number used"),
 ("IMP-P3-05", "P3", "Case set to auto-close as unreachable", "Closure paused"),
 ("IMP-P4-01", "P4", "Shelter address vs 'stable housing'", "Conflict + re-screen"), ("IMP-P4-02", "P4", "Prepaid phone; shelter needs release", "Text first; shelter call locked"),
 ("IMP-P4-03", "P4", "Part 2 SUD record, no consent", "Content hidden"), ("IMP-P4-04", "P4", "Follow-up 'to be arranged'", "FUH countdown + verified slot"),
 ("IMP-P4-05", "P4", "Blood-pressure med lapsed since August", "Listed as secondary"),
 ("IMP-P5-01", "P5", "ED list apixaban 5 mg vs 2.5 mg", "Conflict; dose criteria shown"), ("IMP-P5-02", "P5", "Mail-order refill not yet in feed (trap)", "No alarm; confirm on call"),
 ("IMP-P5-03", "P5", "Caregiver strain only in notes", "AI flag; Maria confirms"), ("IMP-P5-04", "P5", "HRA never asks about caregiver", "Question added to call prep"),
 ("IMP-P5-05", "P5", "Home-health auth pending 90 h", "Hours vs clock; escalate"),
]
out = dict(anchor=ANCHOR, caseManager="Maria R., RN, CCM", activeCases=48, patients=P,
           flaws=[dict(id=a, patient=b, flaw=c_, handled=d) for a, b, c_, d in FLAWS],
           feeds=[["ADT", "8 Nov 00:05", "minutes"], ["RX", "7 Nov 10:02", "daily"], ["HIE", "8 Nov 07:40", "hours–days"], ["LAB", "7 Nov", "days"],
                  ["UM", "5 Nov", "real time"], ["CON", "8 Nov", "real time"], ["CLM", "4 Nov", "30–90 day lag"], ["SDOH", "up to 293 days old", "yearly"]])
assert len(out["flaws"]) == 24
pathlib.Path(__file__).resolve().parent.parent.joinpath("data.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
print("ok", [ (p["rank"], p["id"], p["score"]) for p in P])
