export default function PrivacyPolicy() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
            <p className="mb-4 text-sm text-gray-500">Last updated: March 9, 2026</p>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
                <p className="mb-4">
                    Welcome to SmartGrader. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website and tell you about your privacy rights and how the law protects you.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">2. Data We Collect</h2>
                <p className="mb-4">
                    SmartGrader is an application designed to assist educators in grading assignments using Google Classroom. To provide this service, we collect and process the following data through the Google API:
                </p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                    <li><strong>Profile Information:</strong> Your name and email address to create and manage your account.</li>
                    <li><strong>Google Classroom Data:</strong> We access your Google Classroom courses, rosters, and coursework strictly to facilitate the grading process.</li>
                    <li><strong>Google Drive Data:</strong> We access files submitted by students (e.g., Google Docs) in read-only mode to analyze and generate grades.</li>
                    <li><strong>Google Forms Data:</strong> We access responses to Google Forms linked to your classroom assignments in read-only mode for grading purposes.</li>
                </ul>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">3. How We Use Your Data</h2>
                <p className="mb-4">We use the information we collect solely for the purpose of providing and improving the SmartGrader service:</p>
                <ul className="list-disc pl-6 mb-4 space-y-2">
                    <li>To authenticate your identity and manage your session.</li>
                    <li>To display your courses and assignments within the SmartGrader interface.</li>
                    <li>To read student submissions and pass them to our AI grading algorithms.</li>
                    <li>We do <strong>not</strong> use your Google user data to develop, improve, or train generalized AI and/or ML models.</li>
                </ul>
            </section>

            <section className="mb-8 bg-blue-50 p-6 rounded-lg border border-blue-100">
                <h2 className="text-xl font-semibold mb-3 text-blue-900">4. Google API Services User Data Policy</h2>
                <p className="mb-2 text-blue-800">
                    SmartGrader's use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                    <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        Google API Services User Data Policy
                    </a>
                    , including the Limited Use requirements.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">5. Data Sharing and Disclosure</h2>
                <p className="mb-4">
                    We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties. This does not include trusted third parties who assist us in operating our website, conducting our business, or servicing you, so long as those parties agree to keep this information confidential.
                </p>
                <p className="mb-4">
                    Student submissions are processed through secure API connections to our language model partners (e.g., OpenAI, Google Gemini) for the sole purpose of generating grades and feedback. These partners are not permitted to use this data to train their models.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">6. Data Security</h2>
                <p className="mb-4">
                    We implement a variety of security measures to maintain the safety of your personal information. Access to your data is restricted to authorized personnel only. We do not persistently store student submission content; it is processed in-memory for grading and then discarded.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
                <p className="mb-4">
                    You have the right to revoke SmartGrader's access to your Google account at any time by visiting your Google Account settings page. If you choose to revoke access, SmartGrader will no longer be able to function.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3">8. Contact Us</h2>
                <p className="mb-4">
                    If there are any questions regarding this privacy policy, you may contact us using the information below:
                </p>
                <p className="font-medium">Phil Panfili (phil@smartgrader.app)</p>
            </section>
        </div>
    );
}
