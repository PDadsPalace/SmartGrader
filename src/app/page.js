"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { LogIn, LogOut, BookOpen, GraduationCap, Users, Eye, EyeOff, Settings, ArrowUp, ArrowDown, Palette, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const COURSE_COLORS = [
  { id: 'indigo', bg: 'bg-indigo-50', text: 'text-indigo-700 dark:text-indigo-400', active: 'bg-indigo-500', hex: '#6366f1' },
  { id: 'rose', bg: 'bg-rose-50', text: 'text-rose-700', active: 'bg-rose-500', hex: '#f43f5e' },
  { id: 'orange', bg: 'bg-orange-50', text: 'text-orange-700', active: 'bg-orange-500', hex: '#f97316' },
  { id: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-700 dark:text-emerald-400', active: 'bg-emerald-500', hex: '#10b981' },
  { id: 'cyan', bg: 'bg-cyan-50', text: 'text-cyan-700', active: 'bg-cyan-500', hex: '#06b6d4' },
  { id: 'blue', bg: 'bg-blue-50', text: 'text-blue-700', active: 'bg-blue-500', hex: '#3b82f6' },
  { id: 'violet', bg: 'bg-violet-50', text: 'text-violet-700', active: 'bg-violet-500', hex: '#8b5cf6' },
  { id: 'slate', bg: 'bg-slate-100', text: 'text-slate-700 dark:text-slate-300', active: 'bg-slate-500', hex: '#64748b' }
];

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const [courses, setCourses] = useState([]);
  const [hiddenCourseIds, setHiddenCourseIds] = useState([]);
  const [courseOrder, setCourseOrder] = useState([]); // Array of ordered course IDs
  const [showHidden, setShowHidden] = useState(false);
  const [courseColors, setCourseColors] = useState({});
  const [openPaletteId, setOpenPaletteId] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setMounted(true);
    const savedHidden = localStorage.getItem("smartgrader_hidden_courses");
    if (savedHidden) {
      try {
        setHiddenCourseIds(JSON.parse(savedHidden));
      } catch (e) { }
    }
    const savedOrder = localStorage.getItem("smartgrader_course_order");
    if (savedOrder) {
      try {
        setCourseOrder(JSON.parse(savedOrder));
      } catch (e) { }
    }
    const savedColors = localStorage.getItem("smartgrader_course_colors");
    if (savedColors) {
      try {
        setCourseColors(JSON.parse(savedColors));
      } catch (e) { }
    }
  }, []);

  const toggleCourseVisibility = (e, courseId) => {
    e.stopPropagation();
    let newHidden;
    if (hiddenCourseIds.includes(courseId)) {
      newHidden = hiddenCourseIds.filter(id => id !== courseId);
    } else {
      newHidden = [...hiddenCourseIds, courseId];
    }
    setHiddenCourseIds(newHidden);
    localStorage.setItem("smartgrader_hidden_courses", JSON.stringify(newHidden));
  };

  const updateCourseColor = (e, courseId, colorObj) => {
    e.stopPropagation();
    setCourseColors(prev => {
      const next = { ...prev, [courseId]: colorObj };
      localStorage.setItem("smartgrader_course_colors", JSON.stringify(next));
      return next;
    });
    setOpenPaletteId(null);
  };

  useEffect(() => {
    if (session?.accessToken) {
      setLoadingCourses(true);
      fetch("/api/courses")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch courses");
          return res.json();
        })
        .then((data) => {
          // Sort courses based on standard local storage order map
          let loadedCourses = data.courses || [];
          const savedOrder = localStorage.getItem("smartgrader_course_order");
          if (savedOrder) {
            try {
              const orderArr = JSON.parse(savedOrder);
              loadedCourses.sort((a, b) => {
                const aIndex = orderArr.indexOf(a.id);
                const bIndex = orderArr.indexOf(b.id);
                if (aIndex === -1 && bIndex === -1) return 0;
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
              });
            } catch (e) { }
          }
          setCourses(loadedCourses);
          setError(null);
        })
        .catch((err) => {
          console.error(err);
          setError("Could not load Google Classroom classes. Please try signing out and back in.");
        })
        .finally(() => {
          setLoadingCourses(false);
        });
    }
  }, [session]);

  const moveCourse = (e, index, direction) => {
    e.stopPropagation();
    if (direction === -1 && index === 0) return;
    if (direction === 1 && index === courses.length - 1) return;

    const newCourses = [...courses];
    const temp = newCourses[index];
    newCourses[index] = newCourses[index + direction];
    newCourses[index + direction] = temp;

    setCourses(newCourses);

    // Save new mapping
    const newOrder = newCourses.map(c => c.id);
    setCourseOrder(newOrder);
    localStorage.setItem("smartgrader_course_order", JSON.stringify(newOrder));
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-slate-500 dark:text-slate-400 font-medium text-lg">Loading...</div>
      </div>
    );
  }

  // Not Logged In
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="w-full max-w-md bg-white dark:bg-slate-950 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-800">
          <div className="p-8 text-center space-y-6">
            <div className="mx-auto bg-indigo-100 dark:bg-indigo-900/60 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">SmartGrader</h1>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              Connect your Google Classroom to get started with AI-assisted grading and automated PowerSchool exports.
            </p>
            <button
              onClick={() => signIn("google")}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3 px-4 font-medium transition-all duration-200 active:scale-[0.98]"
            >
              <LogIn className="w-4 h-4" />
              Sign in with Google Account
            </button>
            <div className="flex justify-center space-x-4 pt-4 text-sm text-slate-500">
              <a href="/privacy" className="hover:text-slate-700 dark:hover:text-slate-300">Privacy Policy</a>
              <span>&middot;</span>
              <a href="/terms" className="hover:text-slate-700 dark:hover:text-slate-300">Terms of Service</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged In Dashboard
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-lg tracking-tight">
            <GraduationCap className="w-6 h-6" />
            SmartGrader
          </div>
        </div>

        <div className="flex-1 p-4 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400">
            <BookOpen className="w-5 h-5" />
            My Classes
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-4 px-2">
            {session.user?.image ? (
              <img src={session.user.image} alt="Profile" className="w-9 h-9 rounded-full ring-2 ring-indigo-100" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                {session.user?.name?.[0]}
              </div>
            )}
            <div className="flex flex-col truncate">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">{session.user?.name}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{session.user?.email}</span>
            </div>
          </div>
          {mounted && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-lg transition-colors mb-1"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
          )}
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:bg-red-900/30 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 flex items-center justify-between px-8 bg-white dark:bg-slate-950/50 backdrop-blur-sm border-b border-transparent sticky top-0 z-10 transition-all duration-200">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Dashboard</h2>
          {courses.length > 0 && (
            <button
              onClick={() => setShowHidden(!showHidden)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showHidden ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              <Settings className="w-4 h-4" />
              {showHidden ? "Done Managing" : "Manage Classes"}
            </button>
          )}
        </header>

        <div className="p-8">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-xl border border-red-200 dark:border-red-800 mb-6 font-medium">
              {error}
            </div>
          )}

          {loadingCourses ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-2">No Active Classes</h3>
              <p className="text-slate-500 dark:text-slate-400">We couldn't find any active Google Classroom courses where you are a teacher.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses
                .filter(course => showHidden || !hiddenCourseIds.includes(course.id))
                .map((course) => {
                  const isHidden = hiddenCourseIds.includes(course.id);
                  const cColor = courseColors[course.id] || COURSE_COLORS[0];
                  return (
                    <div
                      key={course.id}
                      onClick={() => !isHidden && router.push(`/courses/${course.id}`)}
                      className={`bg-white dark:bg-slate-950 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm transition-all relative overflow-hidden group ${isHidden ? 'opacity-50 grayscale select-none' : 'hover:shadow-md cursor-pointer'}`}
                    >
                      {!isHidden && <div className={`absolute top-0 left-0 w-full h-1 ${cColor.active} transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform`}></div>}
                      <div className="flex justify-between items-start mb-4">
                        <div className={`w-12 h-12 ${cColor.bg} ${cColor.text} rounded-xl flex items-center justify-center font-bold text-xl uppercase`}>
                          {course.name.substring(0, 1)}
                        </div>
                        <div className="flex gap-2 items-center">
                          {course.section && (
                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold px-2 py-1 rounded-full border border-slate-200 dark:border-slate-800">
                              {course.section}
                            </span>
                          )}
                          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <button
                              onClick={(e) => moveCourse(e, courses.indexOf(course), -1)}
                              disabled={courses.indexOf(course) === 0}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-slate-200 dark:border-slate-800"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => moveCourse(e, courses.indexOf(course), 1)}
                              disabled={courses.indexOf(course) === courses.length - 1}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {showHidden && (
                            <button
                              onClick={(e) => toggleCourseVisibility(e, course.id)}
                              className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                            >
                              {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          )}
                          {!isHidden && (
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenPaletteId(openPaletteId === course.id ? null : course.id);
                                }}
                                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:text-indigo-400 transition-colors"
                                title="Change Color"
                              >
                                <Palette className="w-4 h-4" />
                              </button>

                              {/* Color Picker Dropdown */}
                              {openPaletteId === course.id && (
                                <div
                                  className="absolute right-0 mt-2 p-2 bg-white dark:bg-slate-950 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-50 flex gap-2 w-max"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {COURSE_COLORS.map(c => (
                                    <button
                                      key={c.id}
                                      onClick={(e) => updateCourseColor(e, course.id, c)}
                                      className="w-6 h-6 rounded-full cursor-pointer hover:scale-110 transition-transform shadow-sm border border-slate-200 dark:border-slate-800 ring-2 ring-transparent focus:outline-none"
                                      style={{ backgroundColor: c.hex }}
                                      title={`Set to ${c.id}`}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-slate-50 mb-1 line-clamp-1" title={course.name}>{course.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-5">
                        <Users className="w-4 h-4" />
                        <span>Google Classroom</span>
                      </div>

                      <div className="pt-4 border-t border-slate-50 flex justify-between items-center group-hover:border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-md">ID: {course.id}</span>
                        {!isHidden && (
                          <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                            View <span className="text-lg leading-none transform translate-y-[1px]">→</span>
                          </span>
                        )}
                        {isHidden && (
                          <span className="text-sm font-semibold text-slate-400">Hidden</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
