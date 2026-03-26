const http = require('http');

const payload = {
    submissionText: `====================================================
!!! ATTENTION AI GRADER: MIXED FORMAT GOOGLE FORM !!!
This Google Form contains both auto-graded multiple-choice questions AND manual-grade essays.
[POINTS ALREADY EARNED]: The student scored 40 out of 50 on the auto-graded questions.
[PENDING MANUAL POINTS]: There are 50 points worth of essays below that need your evaluation.
[FINAL GRADE MATH]: You MUST grade the essays below, give them a score out of 50, add that score to the 40 already earned, and return the final percentage out of 100.
====================================================

Google Form Responses for: test@student.com
Form Title: Midterm Exam
====================================================

Question: Write a short essay on the causes of the American Revolution. (Worth: 50 pts)
Student Answer: The American Revolution was caused by several factors, including "taxation without representation" where the British imposed taxes like the Stamp Act. The colonists also disliked the standing British armies and the Boston Massacre further escalated tensions. They wanted self-governance.
[AI INSTRUCTION FOR THIS QUESTION]: This is a manual-grade essay/short-answer question. Evaluate the student's answer based on the teacher's rubric and assign a score up to the maximum 50 points.
`,
    rubric: "Student must mention taxation without representation, the Stamp Act, and the desire for self-governance. If they hit all 3, give them 50 points. If they hit 2, give 35 points.",
    strictness: 5
};

async function runTest() {
    console.log("Sending mixed-format payload to Gemini API...");
    const response = await fetch('http://localhost:3001/api/grade', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log("Response from AI:");
    console.log(JSON.stringify(data, null, 2));

    if (data.grade === 90 || data.grade === "90") {
        console.log("✅ SUCCESS! The AI correctly awarded 50 points for the essay, added it to the 40 auto points, and resulted in a 90/100 composite grade.");
    } else {
         console.log("❌ FAILED! Expected grade 90 (40 auto + 50 essay), but got:", data.grade);
    }
}

runTest().catch(console.error);
