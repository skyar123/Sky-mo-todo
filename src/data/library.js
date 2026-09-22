/* Content with no client information in it: message templates, the share
   library, and the vocabulary the board sorts by. Safe to keep in the repo. */

export const SUPPLIES = ["Meals", "Diapers", "Wipes", "Food box", "Formula", "Clothing", "Gas card", "School supplies", "Books", "Play kit"];

export const KIND = {
  assess: "Assessments",
  care: "Care coordination",
  cpp: "Clinical and CPP",
  plan: "Plans and paperwork",
  admin: "Admin",
};
export const ORDER = ["assess", "care", "cpp", "plan", "admin"];
export const LANES = [["sky", "Me"], ["mo", "Mo"], ["both", "Both"]];

/* Reminder text.

   `when` is the spoken date ("Tuesday the 9th"). `coming` says who the family
   should expect: both of you by default, since that is the usual case.

   Everything here is written from the seat of whoever is holding the phone.
   It used to be written from Skylar's, so on Mo's phone a reminder introduced
   Mo as Skylar, or referred to Mo in the third person, and that goes out to a
   caregiver. Pass `me` and it reads correctly from either side.

   The partner is read from the family's own clinician field rather than
   hardcoded, so a family seen with a different clinician gets that clinician's
   name. */

/** What each of the two is called, for this family. */
export function personName(role, c) {
  return role === "mo" ? c?.clinician || "Mo" : "Skylar";
}

/** The three options, labelled from this phone's point of view.
    The label names the partner generically; the message itself uses the
    clinician on the family it is being written for. */
export function comingOptions(me = "sky") {
  const other = me === "mo" ? "sky" : "mo";
  return [
    ["both", "Both of us"],
    [me, "Just me"],
    [other, `Just ${personName(other, null)}`],
  ];
}

export function whoIsComing(c, coming = "both", me = "sky") {
  const other = me === "mo" ? "sky" : "mo";
  const theirName = personName(other, c);
  if (coming === me) return { subject: "I", verb: "am", contracted: "I'm" };
  if (coming === other) return { subject: theirName, verb: "is", contracted: `${theirName} is` };
  return { subject: `${theirName} and I`, verb: "are", contracted: `${theirName} and I are` };
}

/* "coming out" is wrong when the family travels to the office. */
const arrival = (c, s, when) =>
  c.place === "office"
    ? `${s.contracted} meeting you at the office ${when} at ${c.time}`
    : `${s.contracted} coming out ${when} at ${c.time}`;

export const TONES = [
  {
    id: "warm", label: "Warm",
    build: (c, when, coming, me) =>
      `Hi! Friendly reminder that ${arrival(c, whoIsComing(c, coming, me), when)}. Give this a like or send me a quick reply to confirm. See you then!`,
  },
  {
    id: "short", label: "Short",
    build: (c, when, coming, me) =>
      `Reminder: ${arrival(c, whoIsComing(c, coming, me), when)}. Like this or reply to confirm. Thanks!`,
  },
  {
    id: "first", label: "First visit",
    build: (c, when, coming, me) => {
      const s = whoIsComing(c, coming, me);
      const place = c.place === "office" ? " at the office" : "";
      /* Introduce whoever is sending it, not whoever wrote the app. */
      return `Hi! This is ${personName(me, c)} with Child First. ${s.contracted} looking forward to meeting you ${when} at ${c.time}${place}. Like this message or reply to confirm and I'll see you then.`;
    },
  },
  {
    id: "flex", label: "Offer to move",
    build: (c, when, coming, me) =>
      `Hi! ${arrival(c, whoIsComing(c, coming, me), when)}. Like this to confirm, or tell me if a different time works better this week. Either is fine.`,
  },
];

/* The share library.

   `tag` separates the two jobs these do. "dyad" pieces put something between
   the caregiver and the child: a shared moment, a way of being together, a
   repair. "caregiver" pieces hold up the adult, which matters but is a
   different intervention. Child First work is dyadic, so the board defaults
   to the dyad set.

   Every link is verified by `npm run check:links`, which fails on a dead one.
   A share with no links at all is deliberate: some of these land better as a
   plain message with nothing to click. */
export const SHARE_TAGS = [["dyad", "Between them"], ["caregiver", "For the caregiver"], ["all", "All"]];

export const SHARES = [
  {
    id: "special-time", title: "Ten minutes that are theirs", tag: "dyad",
    blurb: "Child-led play. They pick, you follow, nobody teaches anything.",
    links: [{ label: "Playing with babies and toddlers", url: "https://www.zerotothree.org/resource/tips-on-playing-with-babies-and-toddlers/" }],
    tiny: "One idea for this week: ten minutes where [child] picks the play and you just follow along. No teaching, no questions, no fixing. It does more than it looks like it does.",
    short: "Hi! One small idea for the week.\n\nTen minutes where [child] is completely in charge of the play. They pick it, they lead it, you follow. No teaching, no quizzing, no correcting.\n\nIt sounds like nothing. It is one of the most powerful things there is, because it tells them they are worth following.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking about you and [child] this week.\n\nHere is something worth trying, and it costs ten minutes.\n\nLet [child] be completely in charge of the play. They choose it, they lead it, you follow. The hard part is what you leave out: no teaching, no questions, no correcting, no turning it into a lesson. You just come along and enjoy it with them.\n\nIt sounds like nothing. It is one of the strongest things we know of, because what it tells a child is: what you care about is worth my attention.\n\n\u{1F499} [link1]\n\nIf you try it, I would love to hear what [child] picked.",
  },
  {
    id: "narrating", title: "Saying what you see", tag: "dyad",
    blurb: "Describing the play instead of directing it. Attention, out loud.",
    links: [{ label: "Supporting your child's communication", url: "https://www.zerotothree.org/resource/how-to-support-your-childs-communication-skills/" }],
    tiny: "Something small that goes a long way: while [child] plays, just say what you see. You put the blue one on top. No questions, no teaching. It tells them you are really there.",
    short: "Hi! A small one for the week.\n\nWhile [child] is playing, try just saying what you see. You picked the red one. That went all the way up.\n\nNot questions, not teaching. Just narrating. It builds words, and more than that it tells them you are paying attention to what matters to them.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking of you and [child].\n\nOne small thing that does a lot of work. While [child] plays, try saying what you see them doing. You put the blue one on top. That one went all the way up.\n\nThe trick is what it is not. Not a question, not a quiz, not a correction. Just describing.\n\nIt builds language, but the bigger thing is what it tells them: you are watching, and what they are doing is worth watching.\n\n\u{1F499} [link1]\n\nWhat does [child] get most absorbed in?",
  },
  {
    id: "feelings", title: "Naming it while it happens", tag: "dyad",
    blurb: "Putting words to the feeling in the moment, before fixing it.",
    links: [{ label: "Helping your child develop empathy", url: "https://www.zerotothree.org/resource/how-to-help-your-child-develop-empathy/" }],
    tiny: "A hard feeling gets smaller when someone names it out loud with you. That was so frustrating. You do not have to fix it first. Naming it is the thing.",
    short: "Hi! Thinking of you both.\n\nWhen [child] is having a big feeling, try naming it before solving it. That was really frustrating. You wanted it so badly.\n\nIt can feel like it is not enough. It is usually the part that helps. A feeling that gets named alongside someone gets easier to carry.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking about you and [child] today.\n\nWhen a big feeling shows up, the instinct is usually to fix it fast. One thing that often works better is naming it first. That was really frustrating. You wanted it so much.\n\nIt can feel too small to matter, especially in the middle of a hard moment. But a feeling that someone names with you is easier to carry than one you are holding alone, and that is true at three and at thirty.\n\nYou do not have to agree with it or give in to it. You are just saying: I see it.\n\n\u{1F499} [link1]",
  },
  {
    id: "goodbyes", title: "Hellos and goodbyes", tag: "dyad",
    blurb: "The same small ritual every time. For children who have had endings go badly.",
    links: [],
    tiny: "Little thing that helps a lot: the same short goodbye every time, and a real hello when you come back. Same words, same order. It is the sameness that does the work.",
    short: "Hi! One idea for the week.\n\nGoodbyes get easier when they are the same every time. A short phrase, the same order, and never slipping out without saying it, even when that would be easier in the moment.\n\nAnd the hello matters as much as the goodbye. Coming back, every time, is what makes leaving survivable.",
    full: "Hi! Thinking of you and [child].\n\nSeparations are often the hardest part of the day, and one thing that helps is making them boringly predictable. The same short phrase, the same order, every time. Kiss, wave, see you after nap.\n\nThe temptation is to slip out while they are distracted, because it avoids the hard moment. It usually costs more later, because then any moment could be the one where you disappear.\n\nAnd the hello counts as much as the goodbye. What makes leaving bearable is coming back, over and over, until their body believes it.\n\nWhat does [child] do when you come back?",
  },
  {
    id: "coregulation", title: "They borrow your calm", tag: "dyad",
    blurb: "Co-regulation. Why your steadiness is the intervention, and why it is hard.",
    links: [],
    tiny: "Young children cannot calm down on their own yet. They borrow it from whoever is closest. That is why this is so tiring, and it is also why you matter so much.",
    short: "Hi! Something we come back to a lot.\n\nA young child cannot settle themselves yet. That part of the brain is still being built. What they do instead is borrow calm from whoever is nearest.\n\nWhich is why big feelings are so exhausting to be around, and also why you being there, even quietly, is doing the work.",
    full: "Hi! Thinking about you and [child] this week.\n\nOne thing worth knowing: a child this age genuinely cannot calm themselves down yet. The part of the brain that does that is still under construction and will be for years. What they do instead is borrow it from the nearest steady adult.\n\nThat explains two things. It explains why big feelings are so draining to sit with, because you are lending out your own steadiness. And it explains why just being there, even without saying anything clever, is the actual intervention.\n\nIt also means you cannot do it on empty, which is not a character flaw. It is how the thing works.\n\nSee you [day].",
  },
  {
    id: "routines", title: "The same three things, in the same order", tag: "dyad",
    blurb: "Predictable sequences. Especially for the transitions that go badly.",
    links: [{ label: "Routines for love and learning", url: "https://www.zerotothree.org/resource/creating-routines-for-love-and-learning/" }],
    tiny: "For the part of the day that always goes sideways: same three things, same order, every time. Predictable beats perfect, and it beats fast.",
    short: "Hi! Idea for the week.\n\nPick the part of the day that reliably goes sideways. Bedtime, leaving the house, whatever it is for you.\n\nThen make it the same three things in the same order every single time. Not more steps, not better steps. The same ones.\n\nKnowing what comes next does most of the work.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking of you and [child].\n\nOne idea, for whichever part of the day reliably falls apart.\n\nPick three things and always do them in the same order. Bath, book, song. Shoes, door, car. It does not matter what they are. What matters is that they never change.\n\nA child who knows what comes next has less to brace against, and a transition they can predict is one they can manage. This is usually more useful than making the routine nicer or quicker.\n\n\u{1F499} [link1]\n\nWhich part of the day is hardest at yours right now?",
  },
  {
    id: "everyday", title: "The boring parts count", tag: "dyad",
    blurb: "Brain-building in the moments you are already in. Nothing extra to buy or schedule.",
    links: [{ label: "Vroom", url: "https://www.vroom.org/" }],
    tiny: "Good news: the socks, the car seat, the checkout line. Those already count. You do not need a special activity, you need the moment you are already in.",
    short: "Hi! Something we like about this one.\n\nThe brain-building moments are not extra activities you have to find time for. They are the socks, the car seat, the grocery line. The stuff you are already doing.\n\nTalking, noticing, taking turns in those moments is the whole thing.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking of you and [child] this week.\n\nThere is a whole approach built on one idea we love: you do not need extra time or special toys. The moments that build a young brain are the ones you are already in. Getting socks on. The car seat. Waiting in line.\n\nTalking through it, noticing what they notice, letting them have a turn. That is it. No prep, no cost, nothing to schedule.\n\n\u{1F499} [link1]\n\nIt takes the pressure off, which is maybe the best part.",
  },
  {
    id: "reading", title: "The book is the excuse", tag: "dyad",
    blurb: "Reading together as closeness first, words second. Finishing it is optional.",
    links: [{ label: "Reach Out and Read", url: "https://reachoutandread.org/what-we-do/" }],
    tiny: "Reading together is really about being close with a book in the way. Same page twice, skipping the words, never finishing it. All of that counts.",
    short: "Hi! Small reminder for the week.\n\nReading with [child] is not really about the book. It is about being close, with something to look at together.\n\nSo the same page over and over counts. Making up your own words counts. Never getting to the end absolutely counts.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking of you and [child].\n\nOne thing worth saying, because reading together gets talked about like homework.\n\nIt is not really about the book. It is about being close with something to look at together, and the words come along for the ride. Which means the same page eleven times counts. Making up your own story counts. Getting two pages in and being done absolutely counts.\n\nIf it ever feels like a chore, it has stopped doing the thing it is for.\n\n\u{1F499} [link1]\n\nDoes [child] have one they always go back to?",
  },
  {
    id: "dance", title: "Dancing together", tag: "dyad",
    blurb: "Moving in time with your child builds the bond, not just the beat.",
    links: [{ label: "The research, plain language", url: "https://www.psychologicalscience.org/news/2025-june-dance-children.html" }],
    tiny: "Saw this and loved it: when you dance with your little one, moving in time together actually strengthens the bond between you. Kitchen dance parties count. Hope you have a good day!",
    short: "Hi! Saw something this week that made us think of you two.\n\nResearchers found that when a parent moves in time with their toddler, even a two minute kitchen dance party, the child feels more connected afterward. Moving together does something words cannot.\n\nNo homework here. Just one more reason to turn the music up.",
    full: "Hi! Saw something this week that made us think of you and [child].\n\nResearchers found that when a parent moves in time with their toddler, even a short kitchen dance party, the child feels closer to them afterward and is more willing to work together. Moving in sync does something that words cannot.\n\nHere is the piece if you want it:\n\u{1F499} [link1]\n\nNo homework in this. Just one more reason a two minute dance counts.\n\nWhat music does [child] always move to?",
  },
  {
    id: "serve", title: "Back and forth", tag: "dyad",
    blurb: "Serve and return: the everyday exchanges that build the brain.",
    links: [
      { label: "5 steps, 2 minutes", url: "https://youtu.be/KNrnZag17Ek" },
      { label: "Why it matters", url: "https://developingchild.harvard.edu/resources/videos/serve-return-interaction-shapes-brain-circuitry/" },
    ],
    tiny: "Loved this one: the little back and forth moments, a look, a sound, a wait, are what actually build a child's brain. You already do this all day. [link1]",
    short: "Hi! Thought of you two watching this.\n\nThe back and forth between you and [child], a look, a sound, waiting for their turn, is what builds the wiring in there. You already do it all day without calling it anything.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking of you and [child] today.\n\nThere is a short video we come back to a lot. It is about the small back and forth moments: your child makes a sound or a face, you answer, you wait, they go again. Researchers call it serve and return, and it is one of the biggest things that builds a young brain.\n\nThe part we like is that it is free, it takes no extra time, and you are already doing it.\n\n\u{1F499} [link1]\n\nWhen do the two of you fall into that back and forth most easily?",
  },
  {
    id: "repair", title: "Repair after a hard moment", tag: "dyad",
    blurb: "Circle of Security: rupture and repair is the work, not the failure.",
    links: [{ label: "Circle of Security", url: "https://circleofsecurityinternational.com/" }],
    tiny: "Something we hold onto: the hard moment is not the problem. Coming back afterward is the whole thing, and you do that.",
    short: "Hi! Thinking of you both.\n\nOne thing Circle of Security says that we come back to often: children do not need perfect parents. They need someone who keeps showing up and comes back after the hard moments.\n\nEvery time you come back, that is the part that builds the trust.",
    full: "Hi! Just checking in on you and [child].\n\nWhen a hard moment happens and you come back afterward, that coming back is not damage control. It is the actual thing that builds trust. Circle of Security calls it repair, and it matters more than getting it right the first time.\n\nSo if this week had a rough hour in it, that is not a failure. Nobody gets it right every time, and children are not looking for that.\n\n\u{1F499} [link1]\n\nSee you [day].",
  },
  {
    id: "music", title: "Everyday songs", tag: "dyad",
    blurb: "Singing, rhythm and instruments in ordinary moments.",
    links: [{ label: "ZERO TO THREE on music with little ones", url: "https://www.zerotothree.org/resource/distillation/beyond-twinkle-twinkle-using-music-with-infants-and-toddlers/" }],
    tiny: "Little thing we love: singing during the boring parts of the day, socks, car seat, bath, does real work for a child's brain and makes the moment lighter for you too.",
    short: "Hi! Small idea for the week.\n\nSinging through the ordinary parts of the day, getting socks on, the car seat, bath time, helps with language and with the mood in the room. Made up songs count. Off key counts.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking of you and [child] this week.\n\nOne small idea. Singing through the ordinary moments, socks, car seat, bath, does real work: rhythm, words, turn taking, and it usually softens the moment for both of you. Made up songs count. Off key definitely counts.\n\n\u{1F499} [link1]\n\nIs there a song [child] always asks for?",
  },
  {
    id: "stress", title: "Tools for stress", tag: "caregiver",
    blurb: "Options, not prescriptions. Grounding, breathing, tapping.",
    links: [
      { label: "5-4-3-2-1 grounding", url: "https://youtu.be/30VMIEmA114" },
      { label: "Butterfly hugs", url: "https://youtu.be/BS2zOOre-4U" },
    ],
    tiny: "Thinking of you this week. If you ever want a two minute reset: [link1] Hope the weekend is gentle.",
    short: "Hi! Just wanted you to know we're thinking of you and [child].\n\nWe all get stressed. That is part of being human. If you ever want to try something short:\n\u{1F499} [link1]\n\nWhat do you notice helps you when you're stressed?",
    full: "Hi! Heading into the weekend, we wanted you to know we're thinking about you and [child].\n\nWe all get stressed sometimes, and that is part of being human. Circle of Security has a line we love: children do not need perfect parents. They need parents who keep showing up and who can repair after the hard moments. Taking care of yourself is one of the ways that gets easier.\n\nDifferent things work for different people. Two short ones if you ever want to try:\n\u{1F499} 5-4-3-2-1 grounding: [link1]\n\u{1F499} Butterfly hugs: [link2]\n\nWhat do you notice helps you when you're stressed?\n\nSee you [day].",
  },
  {
    id: "showing-up", title: "Good enough", tag: "caregiver",
    blurb: "For a week where they are running on empty.",
    links: [],
    tiny: "No answer needed. Just: you are doing more than you can see right now. Thinking of you.",
    short: "Hi! No answer needed on this one.\n\nWe know this stretch is heavy. You are still showing up, and your child is registering that even when nothing looks like progress from the inside.\n\nThinking of you.",
    full: "Hi! No answer needed here.\n\nWe know this stretch has been heavy. From the inside it can feel like nothing is moving. From the outside, what we see is someone who keeps showing up for [child] on days when that costs a lot.\n\nThat is the part that counts, and it is not small.\n\nSee you [day].",
  },
];

export const NOTES = [
  "No answer needed. Just wanted you to know your family has been on my mind this week.",
  "Thinking of you both today.",
  "I keep thinking about [child] [doing the thing]. That was a good moment.",
  "That was a heavy hour and you stayed in it. Rest tonight if you can.",
  "Checking in on you, not on the list. How is your week going?",
  "You carry a lot. If one thing would make this week easier, tell me and I will start on it.",
  "Happy birthday to [child]. Hope today has something good in it for both of you.",
  "I have not forgotten about [the thing]. Still working it.",
];

export const RULES = [
  "One thought only. If it needs a real reply, it is a phone call.",
  "Say what you saw, not what it means. No diagnosis and nothing from the chart.",
  "No other names. Not the other parent, not the sibling, not the caseworker.",
  "Nothing that would be a problem if someone else picked up the phone.",
  "Consent to text on file, and the agency policy checked, before the first one goes out.",
];
