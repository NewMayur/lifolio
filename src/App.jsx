import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from "react";
import localforage from "localforage";
import { db, auth } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import styles from "./styles.js";
import LoginScreen from "./LoginScreen";
import { onAuthStateChanged } from "firebase/auth";

// --- MOCK ASYNCSTORAGE / LOCALSTORAGE ---
// We'll use a simple object to simulate localStorage for this environment.
const AppStorage = {
  setItem: async (key, value) => localforage.setItem(key, value),
  getItem: async (key) => localforage.getItem(key),
  removeItem: async (key) => localforage.removeItem(key),
};

// --- CONSTANTS ---
const INITIAL_WALLET_BALANCE = 200;
const CURRENCY = "₹";

// --- CONTEXT ---
const WalletContext = createContext();

const WalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState({
    balance: INITIAL_WALLET_BALANCE,
    currency: CURRENCY,
  });
  const [habits, setHabits] = useState([]);
  const [habitHistory, setHabitHistory] = useState([]); // Removed direct loading from AppStorage
  const [isLoading, setIsLoading] = useState(false); // isLoading is now managed by App component
  const [user, setUser] = useState(null); // Track authenticated user
  const [userProfile, setUserProfile] = useState({ focusArea: "" });
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // This new useEffect listens for real-time authentication changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setIsLoading(true);
      if (currentUser) {
        setUser(currentUser);
        const userId = currentUser.uid;
        const userDocRef = doc(db, "users", userId);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setWallet(
            data.wallet || {
              balance: INITIAL_WALLET_BALANCE,
              currency: CURRENCY,
            }
          );
          setUserProfile(data.userProfile || { focusArea: "" });
          setApiKey(data.apiKey || "");
          setHabits(data.habits || []);
          setHabitHistory(data.habitHistory || []);
        } else {
          const initialData = {
            wallet: { balance: INITIAL_WALLET_BALANCE, currency: CURRENCY },
            userProfile: { focusArea: "" },
            apiKey: "",
            habits: [],
            habitHistory: [],
          };
          await setDoc(userDocRef, initialData);
          setWallet(initialData.wallet);
          setUserProfile(initialData.userProfile);
          setApiKey(initialData.apiKey);
          setHabits(initialData.habits);
          setHabitHistory(initialData.habitHistory);
        }
      } else {
        setUser(null);
        setWallet({ balance: INITIAL_WALLET_BALANCE, currency: CURRENCY });
        setUserProfile({ focusArea: "" });
        setHabits([]);
        setHabitHistory([]);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Persist data whenever it changes
  useEffect(() => {
    if (isLoading || !user) return; // Don't save if loading or logged out

    const saveData = async () => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const userId = user.uid;
        const userDocRef = doc(db, "users", userId);
        await setDoc(
          userDocRef,
          {
            wallet,
            userProfile,
            apiKey,
            habits,
            habitHistory,
          },
          { merge: true }
        );
      } catch (error) {
        setSaveError(error);
      } finally {
        setIsSaving(false);
      }
    };

    const handler = setTimeout(saveData, 500);
    return () => clearTimeout(handler);
  }, [wallet, userProfile, apiKey, habits, habitHistory, user, isLoading]);

  const updateWallet = (amount) => {
    setWallet((prev) => ({ ...prev, balance: prev.balance + amount }));
  };

  const addHabit = (habit, cost) => {
    const newHabits = [...habits, habit];
    setHabits(newHabits);
    updateWallet(-cost);
  };

  const logHabitAction = (habitId, status, change, date) => {
    const newLog = { habitId, date, status, change };
    setHabitHistory((prev) => [...prev, newLog]);
    updateWallet(change);
  };
  const resetAppData = async () => {
    if (user) {
      const initialData = {
        wallet: { balance: INITIAL_WALLET_BALANCE, currency: CURRENCY },
        userProfile: { focusArea: "" },
        habits: [],
        habitHistory: [],
      };
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, initialData);
      setWallet(initialData.wallet);
      setUserProfile(initialData.userProfile);
      setHabits(initialData.habits);
      setHabitHistory(initialData.habitHistory);
    }
  };

  const updateHabit = (id, updatedHabit) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...updatedHabit } : h))
    );
  };

  const deleteHabit = (id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    setHabitHistory((prev) => prev.filter((h) => h.habitId !== id));
  };

  // All the values the rest of the app needs
  const contextValue = {
    wallet,
    habits,
    habitHistory,
    userProfile,
    setUserProfile,
    apiKey,
    setApiKey,
    addHabit,
    updateHabit,
    deleteHabit,
    logHabitAction,
    resetAppData,
    isLoading,
    user,
    isSaving,
    saveError,
  };

  return (
    <WalletContext.Provider value={contextValue}>
            {children}   {" "}
    </WalletContext.Provider>
  );
};

// --- AI SUGGESTIONS SERVICE ---
const aiSuggestions = {
  getSuggestion: (habits, history) => {
    if (habits.length === 0) {
      return {
        title: "Get Started!",
        message: "Create your first habit to begin building a better you.",
      };
    }

    const recentHistory = history.filter((h) => {
      const daysAgo = (new Date() - new Date(h.date)) / (1000 * 60 * 60 * 24);
      return daysAgo <= 7;
    });

    const missedHabits = recentHistory.filter((h) => h.status === "missed");
    if (missedHabits.length > 2) {
      const mostMissed = missedHabits.reduce((acc, h) => {
        acc[h.habitId] = (acc[h.habitId] || 0) + 1;
        return acc;
      }, {});
      const topMissedId = Object.keys(mostMissed).sort(
        (a, b) => mostMissed[b] - mostMissed[a]
      )[0];
      const habit = habits.find((h) => h.id === topMissedId);
      if (habit)
        return {
          title: "Struggling?",
          message: `You've missed "${habit.name}" a few times. Consider lowering the penalty to make it less daunting.`,
        };
    }

    const completedStreaks = habits
      .map((habit) => {
        const habitHistory = recentHistory.filter(
          (h) => h.habitId === habit.id && h.status === "complete"
        );
        return { habit, count: habitHistory.length };
      })
      .filter((item) => item.count >= 3);

    if (completedStreaks.length > 0) {
      const topStreakHabit = completedStreaks.sort(
        (a, b) => b.count - a.count
      )[0].habit;
      return {
        title: "On a Roll!",
        message: `You're consistent with "${topStreakHabit.name}". Maybe it's time to increase the reward?`,
      };
    }

    return {
      title: "Stay Focused",
      message:
        "Consistency is key. Keep logging your habits daily to see progress.",
    };
  },
};

// --- UTILS ---
const cleanText = (text) =>
  text
    .replace(/\*/g, "")
    .replace(/\n\d+\.\s*/g, "\n• ")
    .replace(/^- /gm, "• ");

// --- REUSABLE UI COMPONENTS (Web Version) ---
const AppButton = ({ onClick, title, style, textStyle, disabled = false }) => (
  <button
    onClick={onClick}
    style={{
      ...styles.button,
      ...style,
      ...(disabled ? styles.disabledButton : {}),
    }}
    disabled={disabled}
  >
    <p style={{ ...styles.buttonText, ...textStyle }}>{title}</p>
  </button>
);

const Card = ({ children, style }) => (
  <div style={{ ...styles.card, ...style }}>{children}</div>
);

const CustomModal = ({ visible, onClose, children, title }) => {
  if (!visible) return null;
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        <div style={styles.modalHeader}>
          <p style={styles.modalTitle}>{title}</p>
          <button onClick={onClose} style={styles.modalCloseButton}>
            X
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// --- CHART COMPONENTS (Web Version) ---
const CustomPieChart = ({ data }) => {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return <p style={styles.emptyText}>No data for chart.</p>;

  let accumulated = 0;
  const gradients = data.map((item) => {
    const percentage = (item.count / total) * 100;
    const start = accumulated;
    accumulated += percentage;
    const end = accumulated;
    return `${item.color} ${start}% ${end}%`;
  });

  const conicGradient = `conic-gradient(${gradients.join(", ")})`;

  return (
    <div
      style={{ display: "flex", alignItems: "center", flexDirection: "column" }}
    >
      <div style={{ ...styles.pieChart, backgroundImage: conicGradient }}></div>
      <div style={styles.legendContainer}>
        {data.map((item) => (
          <div key={item.name} style={styles.legendItem}>
            <div
              style={{ ...styles.legendColorBox, backgroundColor: item.color }}
            ></div>
            <p style={styles.legendText}>
              {item.name} ({item.count})
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

const CustomBarChart = ({ data }) => {
  if (!data.labels || data.labels.length === 0)
    return <p style={styles.emptyText}>No data for chart.</p>;

  const values = data.datasets[0].data;
  const maxVal = Math.max(...values.map((v) => Math.abs(v)), 1);

  return (
    <div style={styles.barChartContainer}>
      {values.map((value, index) => (
        <div key={index} style={styles.barWrapper}>
          <div
            style={{
              ...styles.bar,
              height: `${(Math.abs(value) / maxVal) * 100}%`,
              backgroundColor: value >= 0 ? "#4ade80" : "#f87171",
            }}
          ></div>
          <p style={styles.barLabel}>{data.labels[index]}</p>
        </div>
      ))}
    </div>
  );
};

const HabitCalendar = ({ habit, history }) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const habitHistoryForMonth = history.filter((h) => {
    const hDate = new Date(h.date);
    return (
      h.habitId === habit.id &&
      hDate.getFullYear() === year &&
      hDate.getMonth() === month
    );
  });

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} style={styles.calendarDay}></div>);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const log = habitHistoryForMonth.find((h) => h.date === dateStr);
    let dayStyle = styles.calendarDay;
    if (log) {
      dayStyle =
        log.status === "complete"
          ? styles.calendarDayComplete
          : styles.calendarDayMissed;
    }
    days.push(
      <div key={day} style={dayStyle}>
        {day}
      </div>
    );
  }

  return (
    <Card>
      <p style={styles.cardTitle}>{habit.name} - Monthly Progress</p>
      <div style={styles.calendarGrid}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} style={styles.calendarHeader}>
            {day}
          </div>
        ))}
        {days}
      </div>
    </Card>
  );
};

// --- SCREENS (Web Version) ---

const OnboardingScreen = ({ onComplete }) => {
  const { setUserProfile, resetAppData } = useContext(WalletContext);
  const [step, setStep] = useState(1); // Assume start at step 1
  const [focusArea, setFocusArea] = useState("");

  const handleComplete = async () => {
    const profileData = {
      wallet: { balance: INITIAL_WALLET_BALANCE, currency: CURRENCY },
      focusArea,
    };
    setUserProfile((prev) => ({ ...prev, focusArea })); // Update context
    await AppStorage.setItem("userProfile", JSON.stringify(profileData));
    onComplete();
  };

  return (
    <div style={styles.onboardingContainer}>
      <div style={styles.scrollContent}>
        {step === 1 && (
          <>
            <p style={styles.onboardingTitle}>Welcome to Lifefolio</p>
            <p style={styles.onboardingSubtitle}>
              Invest in yourself, literally.
            </p>
            <Card>
              <p style={styles.cardTitle}>How it works:</p>
              <p style={styles.onboardingText}>
                1. You get a starting wallet balance.
              </p>
              <p style={styles.onboardingText}>
                2. You 'invest' in habits by setting rewards & penalties.
              </p>
              <p style={styles.onboardingText}>
                3. Complete habits to earn. Miss them and you pay.
              </p>
            </Card>
            <AppButton
              title="Let's Get Started"
              onClick={() => setStep(2)}
              style={{ marginTop: 30 }}
            />
          </>
        )}
        {step === 2 && (
          <>
            <p style={styles.onboardingTitle}>Your Starting Capital</p>
            <p style={styles.onboardingSubtitle}>
              We're giving you {CURRENCY}
              {INITIAL_WALLET_BALANCE} to start your journey.
            </p>
            <Card>
              <p style={styles.cardTitle}>What's your primary focus?</p>
              <input
                style={styles.input}
                placeholder="e.g., Health, Career, Learning"
                value={focusArea}
                onChange={(e) => setFocusArea(e.target.value)}
              />
            </Card>
            <AppButton
              title="Complete Setup"
              onClick={handleComplete}
              disabled={!focusArea}
              style={{ marginTop: 30 }}
            />
          </>
        )}
      </div>
    </div>
  );
};

const DashboardScreen = ({ navigate }) => {
  const { wallet, habits, habitHistory, apiKey, isLoading } =
    useContext(WalletContext);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);

  if (isLoading === undefined || isLoading) {
    return (
      <div style={styles.container}>
        <p style={styles.title}>Loading...</p>
      </div>
    );
  }

  // Overall performance from reports
  const earningsData = habitHistory.reduce(
    (acc, h) => {
      if (h.change > 0) acc.earnings += h.change;
      else acc.losses += Math.abs(h.change);
      return acc;
    },
    { earnings: 0, losses: 0 }
  );

  const areaDistribution = habits.reduce((acc, h) => {
    const area = h.area || "Uncategorized";
    if (!acc[area]) {
      acc[area] = {
        name: area,
        count: 0,
        color: `#${Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, "0")}`,
      };
    }
    acc[area].count++;
    return acc;
  }, {});

  const pieChartData = Object.values(areaDistribution);

  const profitLossPerHabit = habits.map((habit) => {
    const historyForHabit = habitHistory.filter((h) => h.habitId === habit.id);
    const total = historyForHabit.reduce((sum, h) => sum + h.change, 0);
    return { name: habit.name, total };
  });

  const barChartData = {
    labels: profitLossPerHabit.map((h) => h.name.substring(0, 5)),
    datasets: [
      {
        data: profitLossPerHabit.map((h) => h.total),
      },
    ],
  };

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    setSummaryModalVisible(true);
    setSummary("✨ Analyzing your week with Gemini...");

    const prompt = `Here is my habit data for the last 7 days: ${JSON.stringify(
      habitHistory
    )}. My habits are: ${JSON.stringify(
      habits
    )}. Please provide a concise, encouraging, and actionable weekly summary. Identify my strongest habit and my biggest challenge. Offer one specific tip for improvement. Keep it under 150 words.`;

    if (!apiKey || apiKey.trim() === "") {
      setSummary("Please set your Gemini API key in Settings first.");
      setIsGenerating(false);
      return;
    }

    let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
    const payload = { contents: chatHistory };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.candidates && result.candidates.length > 0) {
        setSummary(result.candidates[0].content.parts[0].text);
      } else {
        setSummary(
          "Could not generate a summary at this time. Check your API key."
        );
      }
    } catch (error) {
      console.error("Gemini summary failed:", error);
      setSummary("Error connecting to the AI for your summary.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>Dashboard</p>

        <Card style={{ marginBottom: 15, padding: 15 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontSize: 24,
                  fontWeight: "bold",
                  color: "#f0f9ff",
                  marginBottom: 0,
                }}
              >
                ₹{wallet.balance.toFixed(2)}
              </p>
              <p style={{ fontSize: 12, color: "#a1a1aa", marginTop: 0 }}>
                Balance
              </p>
            </div>
          </div>
        </Card>

        <Card style={{ marginBottom: 15 }}>
          <p style={styles.cardTitle}>Overall Performance</p>
          <div style={styles.summaryContainer}>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Earnings</p>
              <p style={{ ...styles.summaryValue, color: "#4ade80" }}>
                {CURRENCY}
                {earningsData.earnings.toFixed(2)}
              </p>
            </div>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Losses</p>
              <p style={{ ...styles.summaryValue, color: "#f87171" }}>
                {CURRENCY}
                {earningsData.losses.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        <div
          style={{ ...styles.sectionHeader, marginTop: 10, marginBottom: 15 }}
        >
          <AppButton
            title="✨ Generate Weeklyyyyyyyyyyy Summaryyyyyyyyy"
            onClick={handleGenerateSummary}
            disabled={isGenerating}
            style={{ backgroundColor: "#581c87" }}
          />
        </div>

        {pieChartData.length > 0 && (
          <Card style={{ marginBottom: 15 }}>
            <p style={styles.cardTitle}>Habit Area Distribution</p>
            <CustomPieChart data={pieChartData} />
          </Card>
        )}

        {barChartData.labels.length > 0 && (
          <Card style={{ marginBottom: 15 }}>
            <p style={styles.cardTitle}>Profit/Loss per Habit</p>
            <CustomBarChart data={barChartData} />
          </Card>
        )}

        {habits.length > 0 &&
          habits.map((habit) => (
            <HabitCalendar
              key={habit.id}
              habit={habit}
              history={habitHistory}
            />
          ))}
      </div>
      <CustomModal
        visible={summaryModalVisible}
        onClose={() => setSummaryModalVisible(false)}
        title="✨ Your AI-Powered Weekly Summary"
      >
        <p style={{ ...styles.modalText, whiteSpace: "normal" }}>
          {cleanText(summary)}
        </p>
        <AppButton
          title="Close"
          onClick={() => setSummaryModalVisible(false)}
          disabled={isGenerating}
          style={{ marginTop: 15 }}
        />
      </CustomModal>
    </div>
  );
};

const HabitsScreen = ({ navigate }) => {
  const {
    habits,
    habitHistory,
    updateHabit,
    deleteHabit,
    logHabitAction,
    isSaving,
  } = useContext(WalletContext);
  const [editHabit, setEditHabit] = useState(null);
  const [editName, setEditName] = useState("");
  const [editArea, setEditArea] = useState("");
  const [editReward, setEditReward] = useState("");
  const [editPenalty, setEditPenalty] = useState("");
  const [todayHabits, setTodayHabits] = useState([]);

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const loggedTodayIds = habitHistory
      .filter((h) => h.date === todayStr)
      .map((h) => h.habitId);
    setTodayHabits(habits.filter((h) => !loggedTodayIds.includes(h.id)));
  }, [habits, habitHistory]);

  const getHabitTrend = (habitId) => {
    const today = new Date();
    const recentHistory = habitHistory.filter((h) => {
      const hDate = new Date(h.date);
      const diffDays = (today - hDate) / (1000 * 60 * 60 * 24);
      return h.habitId === habitId && diffDays <= 7;
    });
    const completed = recentHistory.filter(
      (h) => h.status === "complete"
    ).length;
    const missed = recentHistory.filter((h) => h.status === "missed").length;
    if (completed > missed) return "🟢";
    if (missed > completed) return "🔴";
    return "⚪️";
  };

  const handleEdit = (habit) => {
    setEditHabit(habit);
    setEditName(habit.name);
    setEditArea(habit.area || "");
    setEditReward(habit.reward.toString());
    setEditPenalty(habit.penalty.toString());
  };

  const handleSaveEdit = () => {
    const updated = {
      name: editName,
      area: editArea,
      reward: parseFloat(editReward),
      penalty: parseFloat(editPenalty),
    };
    updateHabit(editHabit.id, updated);
    setEditHabit(null);
  };

  const handleDelete = (id) => {
    if (confirm("Delete this habit and all its history?")) {
      deleteHabit(id);
    }
  };

  const handleAction = (habit, status) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const change = status === "complete" ? habit.reward : -habit.penalty;
    logHabitAction(habit.id, status, change, todayStr);
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>My Habits</p>

        <div
          style={{ ...styles.sectionHeader, marginTop: 20, marginBottom: 10 }}
        >
          <AppButton
            title="+ New Habit"
            onClick={() => navigate("CreateHabit")}
            style={styles.smallButton}
            textStyle={styles.smallButtonText}
          />
        </div>

        {habits.length === 0 ? (
          <p style={styles.emptyText}>
            No habits yet. Tap '+ New Habit' to create one!
          </p>
        ) : (
          <>
            {habits.map((item) => (
              <Card
                key={item.id}
                style={{ marginBottom: 8, borderRadius: 12, padding: 12 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span>
                      {getHabitTrend(item.id)} {item.name} ({item.area})
                    </span>
                  </div>
                  <div style={{ textAlign: "right", marginRight: 24 }}>
                    <span style={{ color: "#4ade80", fontSize: 12 }}>
                      /{CURRENCY}
                      {item.reward}
                    </span>
                    <span style={{ color: "#f87171", fontSize: 12 }}>
                      /-{item.penalty}
                    </span>
                  </div>
                  <div style={{ display: "flex" }}>
                    <button
                      onClick={() => handleEdit(item)}
                      style={{ marginRight: 5, fontSize: 14 }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      style={{ fontSize: 14 }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}

        {todayHabits.length > 0 && (
          <>
            <p style={styles.title}>Today's Tracker</p>
            {todayHabits.map((item) => (
              <Card
                key={item.id}
                style={{
                  ...styles.trackerItem,
                  marginBottom: 10,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ flex: 1, fontWeight: "bold" }}>
                    {item.name} ({item.area})
                  </span>
                  <div style={{ ...styles.trackerActions, marginRight: 24 }}>
                    <button
                      style={{
                        ...styles.actionButton,
                        ...styles.completeButton,
                      }}
                      onClick={() => handleAction(item, "complete")}
                      disabled={isSaving}
                    >
                      <span style={styles.actionButtonText}>✓</span>
                    </button>
                    <button
                      style={{ ...styles.actionButton, ...styles.missButton }}
                      onClick={() => handleAction(item, "missed")}
                    >
                      <span style={styles.actionButtonText}>✕</span>
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
      <CustomModal
        visible={editHabit !== null}
        onClose={() => setEditHabit(null)}
        title="Edit Habit"
      >
        <p style={styles.label}>Habit Name</p>
        <input
          style={styles.input}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
        <p style={styles.label}>Area of Life</p>
        <input
          style={styles.input}
          value={editArea}
          onChange={(e) => setEditArea(e.target.value)}
        />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ flex: 1, marginRight: 8 }}>
            <p style={styles.label}>Reward ({CURRENCY})</p>
            <input
              style={styles.input}
              type="number"
              value={editReward}
              onChange={(e) => setEditReward(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, marginLeft: 8 }}>
            <p style={styles.label}>Penalty ({CURRENCY})</p>
            <input
              style={styles.input}
              type="number"
              value={editPenalty}
              onChange={(e) => setEditPenalty(e.target.value)}
            />
          </div>
        </div>
        <AppButton
          title="Save Changes"
          onClick={handleSaveEdit}
          style={{ marginTop: 20 }}
        />
      </CustomModal>
    </div>
  );
};

const CreateHabitScreen = ({ navigate }) => {
  const { wallet, addHabit, userProfile, isSaving } = useContext(WalletContext);
  const [name, setName] = useState("");
  const [area, setArea] = useState(userProfile.focusArea || "");
  const [reward, setReward] = useState("");
  const [penalty, setPenalty] = useState("");
  const [creationCost, setCreationCost] = useState(35);

  useEffect(() => {
    const r = parseFloat(reward) || 0;
    const p = parseFloat(penalty) || 0;
    // Base cost: 10% of reward + 5% of penalty, with a minimum of 5.
    const baseCost = Math.max(5, r * 0.1 + p * 0.05);
    // Final investment cost is 7 times the base cost (a week's worth).
    const finalCost = baseCost * 7;
    setCreationCost(finalCost);
  }, [reward, penalty]);

  const handleCreate = () => {
    if (wallet.balance < creationCost) {
      alert("Insufficient funds to create this habit.");
      return;
    }
    const newHabit = {
      id: `habit_${Date.now()}`,
      name,
      area,
      reward: parseFloat(reward),
      penalty: parseFloat(penalty),
      createdOn: new Date().toISOString(),
    };
    addHabit(newHabit, creationCost);
    navigate("Habits");
  };

  const canAfford = wallet.balance >= creationCost;
  const isFormValid =
    name &&
    area &&
    reward &&
    penalty &&
    parseFloat(reward) >= 0 &&
    parseFloat(penalty) >= 0 &&
    canAfford;

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>Create New Habit</p>

        <Card>
          <p style={styles.label}>Habit Name</p>
          <input
            style={styles.input}
            placeholder="e.g., Morning Workout"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <p style={styles.label}>Area of Life</p>
          <input
            style={styles.input}
            placeholder="e.g., Health"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ flex: 1, marginRight: 8 }}>
              <p style={styles.label}>Reward ({CURRENCY})</p>
              <input
                style={styles.input}
                type="number"
                placeholder="50"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, marginLeft: 8 }}>
              <p style={styles.label}>Penalty ({CURRENCY})</p>
              <input
                style={styles.input}
                type="number"
                placeholder="20"
                value={penalty}
                onChange={(e) => setPenalty(e.target.value)}
              />
            </div>
          </div>

          <div style={styles.costContainer}>
            <p style={styles.costLabel}>
              1-Week Investment Cost: {CURRENCY}
              {creationCost.toFixed(2)}
            </p>
            <p style={styles.costSublabel}>(non-refundable)</p>
          </div>
          {!canAfford && (
            <p style={styles.errorText}>
              Insufficient funds. Your balance is {CURRENCY}
              {wallet.balance.toFixed(2)}.
            </p>
          )}
        </Card>

        <AppButton
          title="Create Habit"
          onClick={handleCreate}
          disabled={!isFormValid || isSaving}
          style={{ marginTop: 20 }}
        />
      </div>
    </div>
  );
};

const DailyTrackerScreen = ({ navigate }) => {
  const { habits, habitHistory, logHabitAction, isSaving } =
    useContext(WalletContext);
  const [todayHabits, setTodayHabits] = useState([]);
  const [aiHint, setAiHint] = useState("");
  const [showHintModal, setShowHintModal] = useState(false);

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const loggedTodayIds = habitHistory
      .filter((h) => h.date === todayStr)
      .map((h) => h.habitId);

    setTodayHabits(habits.filter((h) => !loggedTodayIds.includes(h.id)));
  }, [habits, habitHistory]);

  const handleAction = (habit, status) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const change = status === "complete" ? habit.reward : -habit.penalty;
    logHabitAction(habit.id, status, change, todayStr);

    if (status === "missed") {
      setAiHint(
        `Skipping "${habit.name}" can set you back. Consider if the penalty is high enough to motivate you next time.`
      );
      setShowHintModal(true);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>Today's Tracker</p>
        <p style={styles.subtitle}>{new Date().toDateString()}</p>

        {todayHabits.length === 0 ? (
          <Card>
            <p style={styles.emptyText}>All habits for today are logged! 🎉</p>
          </Card>
        ) : (
          todayHabits.map((item) => (
            <Card
              key={item.id}
              style={{
                ...styles.trackerItem,
                marginBottom: 10,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ flex: 1, fontWeight: "bold" }}>
                  {item.name} ({item.area})
                </span>
                <div style={styles.trackerActions}>
                  <button
                    style={{ ...styles.actionButton, ...styles.completeButton }}
                    onClick={() => handleAction(item, "complete")}
                    disabled={isSaving}
                  >
                    <span style={styles.actionButtonText}>✓</span>
                  </button>
                  <button
                    style={{ ...styles.actionButton, ...styles.missButton }}
                    onClick={() => handleAction(item, "missed")}
                  >
                    <span style={styles.actionButtonText}>✕</span>
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
      <CustomModal
        visible={showHintModal}
        onClose={() => setShowHintModal(false)}
        title="🤖 AI Hint"
      >
        <p style={styles.modalText}>{aiHint}</p>
        <AppButton
          title="Got it"
          onClick={() => setShowHintModal(false)}
          style={{ marginTop: 15 }}
        />
      </CustomModal>
    </div>
  );
};

const ReportsScreen = ({ navigate }) => {
  const { habits, habitHistory, apiKey, isSaving } = useContext(WalletContext);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    setSummaryModalVisible(true);
    setSummary("✨ Analyzing your week with Gemini...");

    const prompt = `Here is my habit data for the last 7 days: ${JSON.stringify(
      habitHistory
    )}. My habits are: ${JSON.stringify(
      habits
    )}. Please provide a concise, encouraging, and actionable weekly summary. Identify my strongest habit and my biggest challenge. Offer one specific tip for improvement. Keep it under 150 words.`;

    if (!apiKey || apiKey.trim() === "") {
      setSummary("Please set your Gemini API key in Settings first.");
      setIsGenerating(false);
      return;
    }

    let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
    const payload = { contents: chatHistory };
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.candidates && result.candidates.length > 0) {
        setSummary(result.candidates[0].content.parts[0].text);
      } else {
        setSummary(
          "Could not generate a summary at this time. Check your API key."
        );
      }
    } catch (error) {
      console.error("Gemini summary failed:", error);
      setSummary("Error connecting to the AI for your summary.");
    } finally {
      setIsGenerating(false);
    }
  };

  const earningsData = habitHistory.reduce(
    (acc, h) => {
      if (h.change > 0) acc.earnings += h.change;
      else acc.losses += Math.abs(h.change);
      return acc;
    },
    { earnings: 0, losses: 0 }
  );

  const areaDistribution = habits.reduce((acc, h) => {
    const area = h.area || "Uncategorized";
    if (!acc[area]) {
      acc[area] = {
        name: area,
        count: 0,
        color: `#${Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, "0")}`,
      };
    }
    acc[area].count++;
    return acc;
  }, {});

  const pieChartData = Object.values(areaDistribution);

  const profitLossPerHabit = habits.map((habit) => {
    const historyForHabit = habitHistory.filter((h) => h.habitId === habit.id);
    const total = historyForHabit.reduce((sum, h) => sum + h.change, 0);
    return { name: habit.name, total };
  });

  const barChartData = {
    labels: profitLossPerHabit.map((h) => h.name.substring(0, 5)),
    datasets: [
      {
        data: profitLossPerHabit.map((h) => h.total),
      },
    ],
  };
  // Add loading indicator for reports if needed
  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <div style={styles.sectionHeader}>
          <p style={styles.headerTitle}>Reports & Insights</p>
          <AppButton
            title="✨ Weekly Summary"
            onClick={handleGenerateSummary}
            disabled={isGenerating}
            style={{ backgroundColor: "#581c87" }}
          />
        </div>

        <Card>
          <p style={styles.cardTitle}>Overall Performance</p>
          <div style={styles.summaryContainer}>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Earnings</p>
              <p style={{ ...styles.summaryValue, color: "#4ade80" }}>
                {CURRENCY}
                {earningsData.earnings.toFixed(2)}
              </p>
            </div>
            <div style={styles.summaryBox}>
              <p style={styles.summaryLabel}>Total Losses</p>
              <p style={{ ...styles.summaryValue, color: "#f87171" }}>
                {CURRENCY}
                {earningsData.losses.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        {habits.map((habit) => (
          <HabitCalendar key={habit.id} habit={habit} history={habitHistory} />
        ))}

        {pieChartData.length > 0 && (
          <Card>
            <p style={styles.cardTitle}>Habit Area Distribution</p>
            <CustomPieChart data={pieChartData} />
          </Card>
        )}

        {barChartData.labels.length > 0 && (
          <Card>
            <p style={styles.cardTitle}>Profit/Loss per Habit</p>
            <CustomBarChart data={barChartData} />
          </Card>
        )}
      </div>
      <CustomModal
        visible={summaryModalVisible}
        onClose={() => setSummaryModalVisible(false)}
        title="✨ Your AI-Powered Weekly Summary"
      >
        <p style={{ ...styles.modalText, whiteSpace: "normal" }}>
          {cleanText(summary)}
        </p>
        <AppButton
          title="Close"
          onClick={() => setSummaryModalVisible(false)}
          disabled={isGenerating}
          style={{ marginTop: 15 }}
        />
      </CustomModal>
    </div>
  );
};

const SettingsScreen = ({ navigate, onReset }) => {
  const {
    apiKey,
    setApiKey,
    resetAppData,
    habits,
    logHabitAction,
    habitHistory,
  } = useContext(WalletContext);
  const [newApiKey, setNewApiKey] = useState(apiKey);

  const handleSaveApiKey = () => {
    setApiKey(newApiKey);
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollContent}>
        <p style={styles.headerTitle}>Settings</p>

        <Card>
          <p style={styles.cardTitle}>AI API Configuration</p>
          <p style={styles.label}>Gemini API Key</p>
          <input
            style={styles.input}
            type="password"
            placeholder="Enter your API key"
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
          />
          <AppButton
            title="Save API Key"
            onClick={handleSaveApiKey}
            style={{ marginTop: 10 }}
          />
          <p style={styles.settingDescription}>
            Required for AI features like habit suggestions and analysis. Get
            your free API key from Google AI Studio.
          </p>
        </Card>

        <Card>
          <p style={styles.cardTitle}>About Lifefolio</p>
          <p style={styles.settingDescription}>
            Version 1.4.0 (Web + AI + Weekly Investment)
          </p>
          <p style={styles.settingDescription}>
            Invest in yourself, intelligently.
          </p>
        </Card>
      </div>
    </div>
  );
};

// --- MAIN APP CONTAINER ---

const AppContent = () => {
  // State for tracking the current screen (e.g., 'Dashboard', 'Onboarding')
  const [currentScreen, setCurrentScreen] = useState("Loading");

  // Get all necessary values from our context
  const { isLoading, userProfile, user, habits, habitHistory, logHabitAction } =
    useContext(WalletContext);

  // The AutoMissHandler component checks for missed habits daily.
  // It's defined here because it needs access to the context.
  const AutoMissHandler = () => {
    useEffect(() => {
      if (isLoading || habits.length === 0 || !user) return;

      const runAutoMiss = async () => {
        const userId = user.uid;
        const userDocRef = doc(db, "users", userId);
        const docSnap = await getDoc(userDocRef);
        const userData = docSnap.data();

        // Get the last auto miss date from firebase
        const lastAutoMissDate = userData.lastAutoMissDate
          ? userData.lastAutoMissDate.toDate()
          : null;

        // Get the current date in Indian timezone
        const now = new Date();
        const indianTimeZone = "Asia/Kolkata";

        // Get yesterday's date in Indian timezone
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayInIndianTime = new Intl.DateTimeFormat("en-IN", {
          timeZone: indianTimeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(yesterday);
        const [yesterdayMonth, yesterdayDay, yesterdayYear] =
          yesterdayInIndianTime.split("/");
        const yesterdayStr = `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;

        habits.forEach((habit) => {
          const habitStartDate = new Date(habit.createdOn)
            .toISOString()
            .split("T")[0];
          if (habitStartDate <= yesterdayStr) {
            const loggedForYesterday = habitHistory.some(
              (h) => h.habitId === habit.id && h.date === yesterdayStr
            );
            if (!loggedForYesterday) {
              logHabitAction(habit.id, "missed", -habit.penalty, yesterdayStr);
            }
          }
        });

        // Update the last auto miss date in firebase
        await setDoc(userDocRef, { lastAutoMissDate: now }, { merge: true });
      };

      runAutoMiss();
    }, [isLoading, habits, habitHistory, logHabitAction, user]);
    return null; // This component doesn't render anything
  };

  // This useEffect is responsible for deciding which screen to show after login.
  useEffect(() => {
    // Only run this logic if loading is complete and we have a logged-in user.
    if (!isLoading && user) {
      if (userProfile && userProfile.focusArea) {
        // If the user has a focus area, they've completed onboarding.
        setCurrentScreen("Dashboard");
      } else {
        // Otherwise, send them to onboarding.
        setCurrentScreen("Onboarding");
      }
    }
  }, [user, isLoading, userProfile]); // This effect runs whenever these values change.

  // Helper functions for navigation within the app.
  const navigate = (screen) => setCurrentScreen(screen);
  const handleReset = () => {
    setCurrentScreen("Onboarding");
  };

  // --- Main Render Logic ---

  // 1. Show a loading screen while Firebase is initializing.
  if (isLoading) {
    return (
      <div style={styles.container}>
        <p style={styles.title}>Loading...</p>
      </div>
    );
  }

  // 2. If loading is done and there's no user, show the Login screen.
  if (!user) {
    return <LoginScreen />;
  }

  // 3. If we have a user, render the correct screen from the main app.
  const renderMainApp = () => {
    switch (currentScreen) {
      case "Onboarding":
        return <OnboardingScreen onComplete={() => navigate("Dashboard")} />;
      case "Dashboard":
        return <DashboardScreen navigate={navigate} />;
      case "Habits":
        return <HabitsScreen navigate={navigate} />;
      case "CreateHabit":
        return <CreateHabitScreen navigate={navigate} />;
      case "Settings":
        return <SettingsScreen navigate={navigate} onReset={handleReset} />;
      default:
        // A fallback loading screen while currentScreen is being set.
        return (
          <div style={styles.container}>
            <p style={styles.title}>Loading screen...</p>
          </div>
        );
    }
  };

  return (
    <div style={styles.appContainer}>
      <AutoMissHandler />
      <div style={{ flex: 1, overflowY: "auto", height: "100%" }}>
        {renderMainApp()}
      </div>
      {/* Navigation bar, visible only on the main app screens */}
      {currentScreen !== "Onboarding" && currentScreen !== "Loading" && (
        <div style={styles.navigation}>
          <button
            style={styles.navButton}
            onClick={() => navigate("Dashboard")}
          >
            <span style={styles.navText}>📊</span>
          </button>
          <button style={styles.navButton} onClick={() => navigate("Habits")}>
            <span style={styles.navText}>📆</span>
          </button>
          <button style={styles.navButton} onClick={() => navigate("Settings")}>
            <span style={styles.navText}>⚙️</span>
          </button>
        </div>
      )}
    </div>
  );
};

// The final export statement for the App component.
export default function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}
