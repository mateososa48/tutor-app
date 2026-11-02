// A reaction that is not a turn of its own ("ok", "ah", "mhm"). Sent while the
// tutor is still talking, it must not cut the tutor off: on Nov 2 a typed "ah"
// stopped "Now you try the next row… What is y?" before the question was heard.
// "yes", "no" and "right" are left out: they can answer a question.
const BACKCHANNEL = /^(?:ok(?:ay)?|k+|ah+|oh+|mhm+|m+|hm+|uh huh|yeah|yea|sure|cool|got it|i see|nice|wow|lol)[.!]*$/i;

export function isBackchannel(text: string): boolean {
  return BACKCHANNEL.test(text.trim().toLowerCase().replace(/\s+/g, " "));
}
