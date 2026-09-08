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

/* `when` is the spoken date, e.g. "Tuesday the 9th". */
export const TONES = [
  { id: "warm", label: "Warm", build: (c, when) => `Hi! Friendly reminder that we're scheduled to meet ${when} at ${c.time}${c.place === "office" ? " at the office" : ""}. Give this a like or send me a quick reply to confirm. See you then!` },
  { id: "short", label: "Short", build: (c, when) => `Reminder: we're on for ${when} at ${c.time}. Like this or reply to confirm. Thanks!` },
  { id: "first", label: "First visit", build: (c, when) => `Hi! This is Skylar with Child First. Looking forward to meeting you ${when} at ${c.time}. Like this message or reply to confirm and I'll see you then.` },
  { id: "flex", label: "Offer to move", build: (c, when) => `Hi! We're set for ${when} at ${c.time}. Like this to confirm, or tell me if a different time works better this week. Either is fine.` },
];

/* Links below are real and were checked. Anything you add yourself
   lives alongside them. */
export const SHARES = [
  {
    id: "dance", title: "Dancing together", blurb: "Moving in time with your child builds the bond, not just the beat.",
    links: [{ label: "The research, plain language", url: "https://www.psychologicalscience.org/news/2025-june-dance-children.html" }],
    tiny: "Saw this and loved it: when you dance with your little one, moving in time together actually strengthens the bond between you. Kitchen dance parties count. Hope you have a good day!",
    short: "Hi! Saw something this week that made us think of you two.\n\nResearchers found that when a parent moves in time with their toddler, even a two minute kitchen dance party, the child feels more connected afterward. Moving together does something words cannot.\n\nNo homework here. Just one more reason to turn the music up.",
    full: "Hi! Saw something this week that made us think of you and [child].\n\nResearchers found that when a parent moves in time with their toddler, even a short kitchen dance party, the child feels closer to them afterward and is more willing to work together. Moving in sync does something that words cannot.\n\nHere is the piece if you want it:\n\u{1F499} [link1]\n\nNo homework in this. Just one more reason a two minute dance counts.\n\nWhat music does [child] always move to?",
  },
  {
    id: "stress", title: "Tools for stress", blurb: "Options, not prescriptions. Grounding, breathing, tapping.",
    links: [
      { label: "5-4-3-2-1 grounding", url: "https://youtu.be/30VMIEmA114" },
      { label: "Butterfly hugs", url: "https://youtu.be/BS2zOOre-4U" },
    ],
    tiny: "Thinking of you this week. If you ever want a two minute reset: [link1] Hope the weekend is gentle.",
    short: "Hi! Just wanted you to know we're thinking of you and [child].\n\nWe all get stressed. That is part of being human. If you ever want to try something short:\n\u{1F499} [link1]\n\nWhat do you notice helps you when you're stressed?",
    full: "Hi! Heading into the weekend, we wanted you to know we're thinking about you and [child].\n\nWe all get stressed sometimes, and that is part of being human. Circle of Security has a line we love: children do not need perfect parents. They need parents who keep showing up and who can repair after the hard moments. Taking care of yourself is one of the ways that gets easier.\n\nDifferent things work for different people. Two short ones if you ever want to try:\n\u{1F499} 5-4-3-2-1 grounding: [link1]\n\u{1F499} Butterfly hugs: [link2]\n\nWhat do you notice helps you when you're stressed?\n\nSee you [day].",
  },
  {
    id: "serve", title: "Back and forth", blurb: "Serve and return: the everyday exchanges that build the brain.",
    links: [
      { label: "5 steps, 2 minutes", url: "https://youtu.be/KNrnZag17Ek" },
      { label: "Why it matters", url: "https://developingchild.harvard.edu/resources/videos/serve-return-interaction-shapes-brain-circuitry/" },
    ],
    tiny: "Loved this one: the little back and forth moments, a look, a sound, a wait, are what actually build a child's brain. You already do this all day. [link1]",
    short: "Hi! Thought of you two watching this.\n\nThe back and forth between you and [child], a look, a sound, waiting for their turn, is what builds the wiring in there. You already do it all day without calling it anything.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking of you and [child] today.\n\nThere is a short video we come back to a lot. It is about the small back and forth moments: your child makes a sound or a face, you answer, you wait, they go again. Researchers call it serve and return, and it is one of the biggest things that builds a young brain.\n\nThe part we like is that it is free, it takes no extra time, and you are already doing it.\n\n\u{1F499} [link1]\n\nWhen do the two of you fall into that back and forth most easily?",
  },
  {
    id: "repair", title: "Repair after a hard moment", blurb: "Circle of Security: rupture and repair is the work, not the failure.",
    links: [],
    tiny: "Something we hold onto: the hard moment is not the problem. Coming back afterward is the whole thing, and you do that.",
    short: "Hi! Thinking of you both.\n\nOne thing Circle of Security says that we come back to often: children do not need perfect parents. They need someone who keeps showing up and comes back after the hard moments.\n\nEvery time you come back, that is the part that builds the trust.",
    full: "Hi! Just checking in on you and [child].\n\nWhen a hard moment happens and you come back afterward, that coming back is not damage control. It is the actual thing that builds trust. Circle of Security calls it repair, and it matters more than getting it right the first time.\n\nSo if this week had a rough hour in it, that is not a failure. Nobody gets it right every time, and children are not looking for that.\n\nSee you [day].",
  },
  {
    id: "music", title: "Everyday songs", blurb: "Singing, rhythm and instruments in ordinary moments.",
    links: [{ label: "ZERO TO THREE on music with little ones", url: "https://www.zerotothree.org/resource/distillation/beyond-twinkle-twinkle-using-music-with-infants-and-toddlers/" }],
    tiny: "Little thing we love: singing during the boring parts of the day, socks, car seat, bath, does real work for a child's brain and makes the moment lighter for you too.",
    short: "Hi! Small idea for the week.\n\nSinging through the ordinary parts of the day, getting socks on, the car seat, bath time, helps with language and with the mood in the room. Made up songs count. Off key counts.\n\n\u{1F499} [link1]",
    full: "Hi! Thinking of you and [child] this week.\n\nOne small idea. Singing through the ordinary moments, socks, car seat, bath, does real work: rhythm, words, turn taking, and it usually softens the moment for both of you. Made up songs count. Off key definitely counts.\n\n\u{1F499} [link1]\n\nIs there a song [child] always asks for?",
  },
  {
    id: "showing-up", title: "Good enough", blurb: "For a week where they are running on empty.",
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
