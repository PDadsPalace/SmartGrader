import Link from 'next/link';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gray-50 pb-16">
            {/* Navigation Bar */}
            <nav className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex-shrink-0 flex items-center">
                            <span className="text-blue-600 text-2xl font-bold">ClassRoomApp</span>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Link href="/privacy" className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">
                                Privacy
                            </Link>
                            <Link href="/terms" className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">
                                Terms
                            </Link>
                            <Link
                                href="/api/auth/signin"
                                className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                            >
                                Sign In
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="mt-16 mx-auto max-w-7xl px-4 sm:mt-24 sm:px-6 lg:mt-32">
                <div className="text-center">
                    <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
                        <span className="block">Supercharge your grading</span>
                        <span className="block text-blue-600">with AI assistance</span>
                    </h1>
                    <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
                        ClassRoomApp seamlessly integrates with Google Classroom to help educators provide faster, more consistent feedback. Connect your account, select an assignment, and let AI do the heavy lifting of initial assessment.
                    </p>
                    <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
                        <div className="rounded-md shadow">
                            <Link
                                href="/api/auth/signin"
                                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10 transition-colors"
                            >
                                Get started
                            </Link>
                        </div>
                    </div>
                </div>
            </main>

            {/* Features Section */}
            <div className="py-16 bg-gray-50 overflow-hidden lg:py-24">
                <div className="relative max-w-xl mx-auto px-4 sm:px-6 lg:px-8 lg:max-w-7xl">
                    <div className="relative">
                        <h2 className="text-center text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                            A better way to grade assignments
                        </h2>
                        <p className="mt-4 max-w-3xl mx-auto text-center text-xl text-gray-500">
                            We leverage Google's ecosystem to make your grading workflow as smooth as possible.
                        </p>
                    </div>

                    <div className="relative mt-12 lg:mt-24 lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center">
                        <div className="relative">
                            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight sm:text-3xl">
                                Seamless Google Classroom Integration
                            </h3>
                            <p className="mt-3 text-lg text-gray-500">
                                ClassRoomApp pulls in your active courses, assignments, and student rosters automatically. No need to manually create classes or import students.
                            </p>

                            <ul className="mt-10 space-y-10">
                                <li>
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                                                {/* Heroicon name: outline/document-text */}
                                                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                        </div>
                                        <div className="ml-4">
                                            <h4 className="text-lg leading-6 font-medium text-gray-900">Google Docs Support</h4>
                                            <p className="mt-2 text-base text-gray-500">
                                                Automatically extract text from student submissions in Google Drive for AI analysis.
                                            </p>
                                        </div>
                                    </div>
                                </li>

                                <li>
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                                                {/* Heroicon name: outline/clipboard-list */}
                                                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                                </svg>
                                            </div>
                                        </div>
                                        <div className="ml-4">
                                            <h4 className="text-lg leading-6 font-medium text-gray-900">Google Forms Support</h4>
                                            <p className="mt-2 text-base text-gray-500">
                                                Read form responses and grade them based on your custom rubrics.
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            </ul>
                        </div>

                        <div className="mt-10 -mx-4 relative lg:mt-0" aria-hidden="true">
                            {/* Decorative element, placeholder for an app screenshot */}
                            <div className="bg-white rounded-lg shadow-xl w-full h-80 flex items-center justify-center border border-gray-100">
                                <span className="text-gray-400 font-medium">Dashboard Preview</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 mt-16">
                <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 md:flex md:items-center md:justify-between lg:px-8">
                    <div className="flex justify-center space-x-6 md:order-2">
                        <Link href="/privacy" className="text-gray-400 hover:text-gray-500">
                            Privacy Policy
                        </Link>
                        <Link href="/terms" className="text-gray-400 hover:text-gray-500">
                            Terms of Service
                        </Link>
                    </div>
                    <div className="mt-8 md:mt-0 md:order-1">
                        <p className="text-center text-base text-gray-400">
                            &copy; {new Date().getFullYear()} ClassRoomApp. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
