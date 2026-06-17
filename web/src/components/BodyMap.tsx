import { Muscle } from '../types'

// Super-simple front + back body map. Muscles worked today glow orange,
// muscles worked earlier this week are faintly shaded. Easy to extend later.
export default function BodyMap({
  today,
  week,
}: {
  today: Muscle[]
  week: Muscle[]
}) {
  const todaySet = new Set(today)
  const weekSet = new Set(week)

  const fill = (m: Muscle): string => {
    if (todaySet.has(m)) return '#f97316' // worked today
    if (weekSet.has(m)) return '#fed7aa' // worked this week
    return '#e5e7eb' // untrained
  }

  const skin = '#cbd5e1'
  const outline = '#94a3b8'

  return (
    <div className="bodymap">
      <svg viewBox="0 0 320 260" xmlns="http://www.w3.org/2000/svg" width="100%">
        {/* ---------------- FRONT ---------------- */}
        <g>
          <text x="80" y="14" textAnchor="middle" fontSize="11" fill="#6b7280">Front</text>
          {/* head */}
          <circle cx="80" cy="34" r="13" fill={skin} stroke={outline} />
          {/* neck */}
          <rect x="74" y="45" width="12" height="8" fill={skin} />
          {/* shoulders */}
          <ellipse cx="56" cy="62" rx="11" ry="9" fill={fill('shoulders')} stroke={outline} />
          <ellipse cx="104" cy="62" rx="11" ry="9" fill={fill('shoulders')} stroke={outline} />
          {/* chest */}
          <rect x="64" y="56" width="14" height="18" rx="4" fill={fill('chest')} stroke={outline} />
          <rect x="82" y="56" width="14" height="18" rx="4" fill={fill('chest')} stroke={outline} />
          {/* biceps */}
          <ellipse cx="50" cy="86" rx="7" ry="13" fill={fill('biceps')} stroke={outline} />
          <ellipse cx="110" cy="86" rx="7" ry="13" fill={fill('biceps')} stroke={outline} />
          {/* forearms */}
          <ellipse cx="46" cy="112" rx="6" ry="13" fill={fill('forearms')} stroke={outline} />
          <ellipse cx="114" cy="112" rx="6" ry="13" fill={fill('forearms')} stroke={outline} />
          {/* abs */}
          <rect x="71" y="76" width="18" height="26" rx="4" fill={fill('abs')} stroke={outline} />
          {/* obliques */}
          <rect x="63" y="78" width="7" height="22" rx="3" fill={fill('obliques')} stroke={outline} />
          <rect x="90" y="78" width="7" height="22" rx="3" fill={fill('obliques')} stroke={outline} />
          {/* quads */}
          <rect x="66" y="106" width="11" height="34" rx="5" fill={fill('quads')} stroke={outline} />
          <rect x="83" y="106" width="11" height="34" rx="5" fill={fill('quads')} stroke={outline} />
          {/* lower legs (shins, not a tracked muscle) */}
          <rect x="67" y="142" width="9" height="28" rx="4" fill={skin} stroke={outline} />
          <rect x="84" y="142" width="9" height="28" rx="4" fill={skin} stroke={outline} />
        </g>

        {/* ---------------- BACK ---------------- */}
        <g>
          <text x="240" y="14" textAnchor="middle" fontSize="11" fill="#6b7280">Back</text>
          {/* head */}
          <circle cx="240" cy="34" r="13" fill={skin} stroke={outline} />
          <rect x="234" y="45" width="12" height="8" fill={skin} />
          {/* shoulders (rear delts) */}
          <ellipse cx="216" cy="62" rx="11" ry="9" fill={fill('shoulders')} stroke={outline} />
          <ellipse cx="264" cy="62" rx="11" ry="9" fill={fill('shoulders')} stroke={outline} />
          {/* traps */}
          <path d="M226 54 L254 54 L246 70 L234 70 Z" fill={fill('traps')} stroke={outline} />
          {/* lats / back */}
          <rect x="224" y="68" width="14" height="22" rx="4" fill={fill('lats')} stroke={outline} />
          <rect x="242" y="68" width="14" height="22" rx="4" fill={fill('lats')} stroke={outline} />
          {/* triceps */}
          <ellipse cx="210" cy="86" rx="7" ry="13" fill={fill('triceps')} stroke={outline} />
          <ellipse cx="270" cy="86" rx="7" ry="13" fill={fill('triceps')} stroke={outline} />
          {/* forearms */}
          <ellipse cx="206" cy="112" rx="6" ry="13" fill={fill('forearms')} stroke={outline} />
          <ellipse cx="274" cy="112" rx="6" ry="13" fill={fill('forearms')} stroke={outline} />
          {/* lower back */}
          <rect x="231" y="91" width="18" height="14" rx="4" fill={fill('lower_back')} stroke={outline} />
          {/* glutes */}
          <ellipse cx="232" cy="116" rx="9" ry="9" fill={fill('glutes')} stroke={outline} />
          <ellipse cx="248" cy="116" rx="9" ry="9" fill={fill('glutes')} stroke={outline} />
          {/* hamstrings */}
          <rect x="226" y="126" width="11" height="28" rx="5" fill={fill('hamstrings')} stroke={outline} />
          <rect x="243" y="126" width="11" height="28" rx="5" fill={fill('hamstrings')} stroke={outline} />
          {/* calves */}
          <rect x="227" y="156" width="9" height="26" rx="4" fill={fill('calves')} stroke={outline} />
          <rect x="244" y="156" width="9" height="26" rx="4" fill={fill('calves')} stroke={outline} />
        </g>
      </svg>

      <div className="bodymap-legend">
        <span><i style={{ background: '#f97316' }} /> Today</span>
        <span><i style={{ background: '#fed7aa' }} /> This week</span>
        <span><i style={{ background: '#e5e7eb' }} /> Untrained</span>
        {todaySet.has('cardio') && <span className="cardio-badge">❤️ Cardio today</span>}
      </div>
    </div>
  )
}
