// 후보 음원의 측정 결과. tools/audio-check.html이 이 파일을 읽어
// 열자마자 목록을 보여 준다. 같은 파일이면 결과가 늘 같으므로
// 열 때마다 다시 분석하지 않는다.
//
// 측정은 tools/measure-track.mjs 하나에서만 나온다. 점검 페이지는
// 이 숫자를 그리기만 하고 스스로 재지 않는다.
//
// 후보를 추가하거나 교체한 뒤에는 tools/bake-candidates.mjs를 돌려
// 이 파일을 다시 만든다. 손으로 고치지 않는다.

window.AUDIO_CANDIDATES = [
  {
    cue: 'bgm-underground',
    base: '../client/src/assets/audio/candidates/underground/',
    takes: [
      {"file":"take11_A_Place_Left_Behind.ogg","metrics":{"duration":177.162,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":3.084,"clipped":11409,"level":-12.02,"headFade":0.1,"tailFade":1.75,"build":0.574,"spread":2.167,"seamStep":27.709,"seamJump":0,"bpm":[92,86,96],"air":-51.416,"mid":-15.762,"bands":{"low":-3.629,"lowMid":-5.944,"mid":-15.762,"high":-36.734,"air":-51.416},"midShare":0.037}},
      {"file":"take12_Slow_Breathing_Walls.ogg","metrics":{"duration":178.913,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":2.825,"clipped":8941,"level":-11.547,"headFade":0.05,"tailFade":2.95,"build":-0.205,"spread":2.87,"seamStep":40.578,"seamJump":0,"bpm":[96,78,81],"air":-50.231,"mid":-15.77,"bands":{"low":-3.281,"lowMid":-6.47,"mid":-15.77,"high":-36.758,"air":-50.231},"midShare":0.037}},
      {"file":"take19_Just_After_They_Left.ogg","metrics":{"duration":175.465,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":3.238,"clipped":6819,"level":-11.787,"headFade":0.05,"tailFade":2.8,"build":1.054,"spread":3.01,"seamStep":39.408,"seamJump":0,"bpm":[78,81,133],"air":-52.349,"mid":-17.375,"bands":{"low":-2.84,"lowMid":-6.682,"mid":-17.375,"high":-37.974,"air":-52.349},"midShare":0.024}},
    ],
  },
  {
    cue: 'bgm-return',
    base: '../client/src/assets/audio/candidates/return/',
    takes: [
      {"file":"take15_Cathedral_of_Glass.ogg","metrics":{"duration":176.3,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":3.111,"clipped":2761,"level":-11.743,"headFade":2.95,"tailFade":2.7,"build":1.095,"spread":3.11,"seamStep":6.346,"seamJump":0,"bpm":[81,78,83],"air":-37.518,"mid":-8.276,"bands":{"low":-7.318,"lowMid":-4.669,"mid":-8.276,"high":-23.531,"air":-37.518},"midShare":0.219}},
      {"file":"take16_Suspended_in_White.ogg","metrics":{"duration":174.341,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":3.121,"clipped":2925,"level":-12.676,"headFade":3.15,"tailFade":3.25,"build":4.112,"spread":6.696,"seamStep":7.031,"seamJump":0,"bpm":[81,78,83],"air":-38.267,"mid":-8.758,"bands":{"low":-7.32,"lowMid":-4.545,"mid":-8.758,"high":-25.547,"air":-38.267},"midShare":0.198}},
      {"file":"take17_Unsettled_Light.ogg","metrics":{"duration":175.099,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":2.822,"clipped":1526,"level":-12.58,"headFade":2.3,"tailFade":3.05,"build":0.522,"spread":1.713,"seamStep":11.308,"seamJump":0,"bpm":[81,78,129],"air":-37.099,"mid":-8.858,"bands":{"low":-6.779,"lowMid":-4.64,"mid":-8.858,"high":-23.655,"air":-37.099},"midShare":0.189}},
      {"file":"take21_Vigil_in_Concrete.ogg","metrics":{"duration":175.099,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":3.737,"clipped":17841,"level":-12.242,"headFade":0.05,"tailFade":1.7,"build":2.129,"spread":5.351,"seamStep":35.676,"seamJump":0,"bpm":[81,96,86],"air":-46.066,"mid":-14.074,"bands":{"low":-4.44,"lowMid":-5.225,"mid":-14.074,"high":-33.523,"air":-46.066},"midShare":0.056}},
      {"file":"take23_Smiling_Through_Glass.ogg","metrics":{"duration":175.726,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":3.7,"clipped":3716,"level":-12.625,"headFade":0.1,"tailFade":1.7,"build":2.238,"spread":6.095,"seamStep":33.519,"seamJump":0,"bpm":[81,78,129],"air":-33.091,"mid":-7.766,"bands":{"low":-6.974,"lowMid":-4.821,"mid":-7.766,"high":-21.819,"air":-33.091},"midShare":0.237}},
      {"file":"take59_A_Terrible_Salvation.ogg","metrics":{"duration":118.361,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":2.313,"clipped":1224,"level":-12.689,"headFade":0.1,"tailFade":1.7,"build":0.224,"spread":1.785,"seamStep":39.171,"seamJump":0,"bpm":[133,89,129],"air":-40.358,"mid":-17.46,"bands":{"low":-4.639,"lowMid":-4.535,"mid":-17.46,"high":-35.907,"air":-40.358},"midShare":0.025}},
      {"file":"take60_The_Sterile_Nave.ogg","metrics":{"duration":113.894,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":2.538,"clipped":904,"level":-12.613,"headFade":0.1,"tailFade":1.65,"build":0.742,"spread":1.814,"seamStep":34.459,"seamJump":0,"bpm":[133,89,86],"air":-32.791,"mid":-12.2,"bands":{"low":-4.586,"lowMid":-4.744,"mid":-12.2,"high":-25.729,"air":-32.791},"midShare":0.081}},
      {"file":"take63_The_Unchanging_Noon.ogg","metrics":{"duration":117.995,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":3.144,"clipped":1700,"level":-12.953,"headFade":0.05,"tailFade":1.4,"build":0.104,"spread":2.427,"seamStep":37.761,"seamJump":0,"bpm":[133,129,89],"air":-36.165,"mid":-11.881,"bands":{"low":-5.988,"lowMid":-3.984,"mid":-11.881,"high":-26.539,"air":-36.165},"midShare":0.09}},
      {"file":"take64_Marble_Ritual.ogg","metrics":{"duration":117.812,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":3.986,"clipped":17351,"level":-12.224,"headFade":0.1,"tailFade":1.3,"build":-0.088,"spread":3.335,"seamStep":39.325,"seamJump":0,"bpm":[133,88,89],"air":-28.544,"mid":-15.034,"bands":{"low":-4.183,"lowMid":-4.923,"mid":-15.034,"high":-26.371,"air":-28.544},"midShare":0.042}},
      {"file":"take65_Surgical_Alignment.ogg","metrics":{"duration":119.562,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":3.218,"clipped":5313,"level":-12.749,"headFade":0.1,"tailFade":1.8,"build":5.899,"spread":8.746,"seamStep":36.192,"seamJump":0,"bpm":[129,131,133],"air":-33.551,"mid":-11.969,"bands":{"low":-3.457,"lowMid":-5.91,"mid":-11.969,"high":-26.256,"air":-33.551},"midShare":0.082}},
      {"file":"take66_Precision_in_Marble.ogg","metrics":{"duration":118.361,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":2.5,"clipped":744,"level":-12.628,"headFade":0.1,"tailFade":1.55,"build":0.152,"spread":2.739,"seamStep":33.817,"seamJump":0,"bpm":[133,89,129],"air":-38.765,"mid":-12.698,"bands":{"low":-6.341,"lowMid":-3.545,"mid":-12.698,"high":-28.115,"air":-38.765},"midShare":0.074}},
      {"file":"take67_Surgical_Meridian.ogg","metrics":{"duration":119.406,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":2.107,"clipped":1228,"level":-12.404,"headFade":0.1,"tailFade":1.15,"build":0.379,"spread":1.321,"seamStep":36.214,"seamJump":0,"bpm":[133,89,129],"air":-27.615,"mid":-15.264,"bands":{"low":-5.603,"lowMid":-3.918,"mid":-15.264,"high":-27.781,"air":-27.615},"midShare":0.042}},
      {"file":"take68_Calculated_Grace.ogg","metrics":{"duration":119.327,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":2.608,"clipped":2056,"level":-12.591,"headFade":1.9,"tailFade":1.05,"build":0.119,"spread":0.953,"seamStep":11.131,"seamJump":0,"bpm":[129,133,126],"air":-36.832,"mid":-11.838,"bands":{"low":-5.289,"lowMid":-4.663,"mid":-11.838,"high":-26.187,"air":-36.832},"midShare":0.093}},
      {"file":"take69_The_Surgeon_s_Cathedral.ogg","metrics":{"duration":120.033,"isSfx":false,"containerRate":48000,"channels":2,"duplicated":false,"peak":2.729,"clipped":967,"level":-12.815,"headFade":0.1,"tailFade":1.15,"build":1.621,"spread":4.07,"seamStep":31.032,"seamJump":0,"bpm":[133,89,86],"air":-30.933,"mid":-13.014,"bands":{"low":-5.906,"lowMid":-3.933,"mid":-13.014,"high":-26.434,"air":-30.933},"midShare":0.07}},
    ],
  },
];
