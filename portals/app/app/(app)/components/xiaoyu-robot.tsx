// Original product illustration. UI dimensions and animation use DS tokens.
export function XiaoyuRobot() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 270" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="yu-shell" x1="84" y1="60" x2="190" y2="218" gradientUnits="userSpaceOnUse"><stop stopColor="var(--card)"/><stop offset=".52" stopColor="var(--card)"/><stop offset="1" stopColor="var(--primary-muted)"/></linearGradient>
    <linearGradient id="yu-rim" x1="78" y1="73" x2="211" y2="142" gradientUnits="userSpaceOnUse"><stop stopColor="var(--primary-muted)"/><stop offset="1" stopColor="var(--border)"/></linearGradient>
    <linearGradient id="yu-face" x1="95" y1="88" x2="180" y2="140" gradientUnits="userSpaceOnUse"><stop stopColor="var(--primary-muted-foreground)"/><stop offset="1" stopColor="var(--foreground)"/></linearGradient>
    <linearGradient id="yu-eye" x1="111" y1="103" x2="118" y2="121" gradientUnits="userSpaceOnUse"><stop stopColor="var(--card)"/><stop offset="1" stopColor="var(--info-border)"/></linearGradient>
  </defs>
  <ellipse cx="143" cy="247" rx="70" ry="10" fill="var(--primary)" opacity=".07"/>
  <g className="robot-hover-body">
    <g className="robot-arm-rest"><path d="M90 163C69 160 58 177 62 196" stroke="var(--border)" strokeWidth="21" strokeLinecap="round"/><path d="M90 160C72 160 62 176 65 192" stroke="url(#yu-shell)" strokeWidth="16" strokeLinecap="round"/><ellipse cx="65" cy="197" rx="12" ry="14" fill="url(#yu-shell)" stroke="var(--border)" strokeWidth="1.5"/></g>
    <g className="robot-wave"><path d="M193 164C218 161 228 138 229 122" stroke="var(--border)" strokeWidth="20" strokeLinecap="round"/><path d="M194 161C216 158 225 139 226 123" stroke="url(#yu-shell)" strokeWidth="16" strokeLinecap="round"/><path d="M217 122L214 112C213 108 215 105 218 105L221 108L222 94C222 91 226 90 228 93L230 105L234 94C236 91 240 93 239 96L236 109L242 102C245 100 248 103 246 106L237 121C231 130 223 129 217 122Z" fill="url(#yu-shell)" stroke="var(--border)" strokeWidth="1.5"/></g>
    <path d="M111 209L108 233C108 244 129 244 132 235L135 212M155 212L157 235C159 244 179 244 180 234L178 208" fill="url(#yu-shell)" stroke="var(--border)" strokeWidth="1.5"/>
    <path d="M101 166C101 149 184 149 186 166L189 194C191 219 100 225 97 196L101 166Z" fill="url(#yu-shell)" stroke="var(--border)" strokeWidth="1.5"/>
    <path d="M112 168C129 174 157 174 175 168" stroke="var(--primary-muted)" strokeWidth="5" strokeLinecap="round"/>
    <rect x="127" y="180" width="29" height="23" rx="9" fill="var(--primary-muted)"/>
    <path d="M135 188L142 194L149 186" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="143" cy="214" r="3" fill="var(--primary)" opacity=".25"/>
    <g className="robot-head">
      <path d="M143 62V49" stroke="var(--primary-muted-foreground)" strokeWidth="5" strokeLinecap="round"/><circle cx="143" cy="43" r="8" fill="var(--primary-muted)" stroke="var(--card)" strokeWidth="3"/><circle cx="143" cy="43" r="3" fill="var(--primary)"/>
      <rect x="70" y="96" width="17" height="33" rx="8" fill="url(#yu-rim)"/><rect x="199" y="96" width="17" height="33" rx="8" fill="url(#yu-rim)"/>
      <rect x="78" y="65" width="130" height="94" rx="36" fill="url(#yu-shell)" stroke="var(--border)" strokeWidth="1.5"/>
      <path d="M98 75C114 70 137 69 155 72" stroke="var(--card)" strokeWidth="6" strokeLinecap="round"/>
      <rect x="89" y="81" width="108" height="66" rx="25" fill="url(#yu-face)"/>
      <path d="M99 91C114 85 132 84 146 86" stroke="var(--card)" opacity=".16" strokeWidth="3" strokeLinecap="round"/>
      <g className="robot-eyes"><rect x="110" y="101" width="12" height="20" rx="6" fill="url(#yu-eye)"/><rect x="163" y="101" width="12" height="20" rx="6" fill="url(#yu-eye)"/></g>
      <path d="M134 126Q143 133 152 126" stroke="var(--info-border)" strokeWidth="3" strokeLinecap="round"/>
      <ellipse cx="108" cy="130" rx="8" ry="3" fill="var(--primary-muted)" opacity=".18"/><ellipse cx="177" cy="130" rx="8" ry="3" fill="var(--primary-muted)" opacity=".18"/>
    </g>
  </g>
</svg>;
}
