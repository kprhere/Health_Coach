// ============================================================
// v4-legacy-program.js - a frozen copy of the program that every install
// shipped with before STATE_VERSION 4, serialised as plain data.
//
// Migration snapshots are duplicated on purpose rather than imported from
// data.js or from a starter profile. A migration has to keep meaning the same
// thing forever: if it read a living constant, editing that constant would
// silently rewrite what past upgrades did. Do not "tidy" this into a
// reference to the current program.
//
// It exists only so an install upgrading from version 3 gets back the routine
// it was actually training. Once every install is past version 4, delete it.
// ============================================================

export const V4_LEGACY_PROGRAM = Object.freeze(
  {
    "name": "Recomp Upper / Lower Hybrid",
    "days": {
      "0": {
        "key": "lowerB",
        "title": "Lower Body B",
        "focus": "Hypertrophy",
        "dayType": "training",
        "intensity": "Hard",
        "blocks": [
          {
            "blockType": "single",
            "name": "Hack Squat",
            "exercises": [
              {
                "name": "Hack Squat",
                "sets": 4,
                "repLow": 8,
                "repHigh": 10,
                "rpe": 8,
                "restSec": 150,
                "tempo": "3-1-1",
                "note": "Main quad. Arsenal Inverted Leg Press is the alternative"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Hip Thrust",
            "exercises": [
              {
                "name": "Hip Thrust",
                "sets": 4,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 8,
                "restSec": 120,
                "tempo": "2-1-2",
                "note": "Hip hinge and glutes, full lockout squeeze"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Life Fitness Leg Press",
            "exercises": [
              {
                "name": "Life Fitness Leg Press",
                "sets": 3,
                "repLow": 12,
                "repHigh": 15,
                "rpe": 8,
                "restSec": 90,
                "tempo": "2-0-1",
                "note": "Secondary quad and glute"
              }
            ]
          },
          {
            "blockType": "superset",
            "name": "Leg Curl + Leg Extension",
            "rounds": 3,
            "restAfterRoundSec": 75,
            "exercises": [
              {
                "name": "Lying Leg Curl",
                "targetReps": "12-15",
                "targetRpe": 9
              },
              {
                "name": "Leg Extension",
                "targetReps": "15",
                "targetRpe": 9
              }
            ],
            "note": "Hamstring then quad, no rest between"
          },
          {
            "blockType": "dropset",
            "name": "Seated Calf Raise",
            "exercises": [
              {
                "name": "Seated Calf Raise",
                "sets": 3,
                "repLow": 12,
                "repHigh": 15,
                "rpe": 10,
                "restSec": 45,
                "tempo": "2-1-2",
                "drops": [
                  {
                    "label": "Drop 1 (-20%)",
                    "targetReps": "to failure"
                  },
                  {
                    "label": "Drop 2 (-20%)",
                    "targetReps": "to failure"
                  }
                ],
                "note": "Top set ~1 rep shy, then strip the weight twice and keep going"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Bulgarian Split Squat",
            "exercises": [
              {
                "name": "Bulgarian Split Squat",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 8,
                "restSec": 90,
                "tempo": "2-0-1",
                "note": "Unilateral, per leg"
              }
            ]
          },
          {
            "blockType": "circuit",
            "name": "Core Circuit",
            "rounds": 3,
            "restAfterRoundSec": 45,
            "exercises": [
              {
                "name": "Cable Woodchop",
                "targetReps": "10 / side",
                "targetRpe": 8
              },
              {
                "name": "Lying Leg Raise",
                "targetReps": "12-15",
                "targetRpe": 8
              }
            ],
            "note": ""
          }
        ],
        "conditioning": [
          {
            "name": "Incline Walk",
            "detail": "15 min easy, low incline. Short on purpose — legs were just worked."
          }
        ],
        "mobility": [],
        "sport": [],
        "notes": "Last hard session of the week. If performance has stalled two weeks running, take an easy deload next week. Progressive overload is what protects muscle in a deficit, so beat last week on something: reps, load or a cleaner tempo."
      },
      "1": {
        "key": "upperA",
        "title": "Upper Body A",
        "focus": "Strength",
        "dayType": "training",
        "intensity": "Hard",
        "blocks": [
          {
            "blockType": "single",
            "name": "Hammer Strength Bench Press",
            "exercises": [
              {
                "name": "Hammer Strength Bench Press",
                "sets": 4,
                "repLow": 6,
                "repHigh": 8,
                "rpe": 7,
                "restSec": 150,
                "tempo": "3-1-1",
                "note": "Main press. Restart block: stop 2 reps short, no grinding"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Hammer Strength High Row",
            "exercises": [
              {
                "name": "Hammer Strength High Row",
                "sets": 4,
                "repLow": 8,
                "repHigh": 10,
                "rpe": 8,
                "restSec": 120,
                "tempo": "2-1-1",
                "note": "Opposite pattern to the press"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Hammer Strength Iso Shoulder Press",
            "exercises": [
              {
                "name": "Hammer Strength Iso Shoulder Press",
                "sets": 3,
                "repLow": 8,
                "repHigh": 10,
                "rpe": 8,
                "restSec": 105,
                "tempo": "2-0-1",
                "note": "Secondary press for delts"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Lat Pulldown",
            "exercises": [
              {
                "name": "Lat Pulldown",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 8,
                "restSec": 90,
                "tempo": "2-1-1",
                "note": "Second pull for lat width"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Life Fitness Bicep Curl",
            "exercises": [
              {
                "name": "Life Fitness Bicep Curl",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 9,
                "restSec": 75,
                "tempo": "2-0-1",
                "note": "Direct biceps"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Life Fitness Tricep Press",
            "exercises": [
              {
                "name": "Life Fitness Tricep Press",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 9,
                "restSec": 75,
                "tempo": "2-0-1",
                "note": "Direct triceps"
              }
            ]
          },
          {
            "blockType": "superset",
            "name": "Lateral Raise + Face Pull",
            "rounds": 3,
            "restAfterRoundSec": 60,
            "exercises": [
              {
                "name": "Arsenal Standing Lateral Raise",
                "targetReps": "12-15",
                "targetRpe": 9
              },
              {
                "name": "Face Pull",
                "targetReps": "15-20",
                "targetRpe": 8
              }
            ],
            "note": "Delts and shoulder health. No rest between the two, 60s after each round"
          },
          {
            "blockType": "finisher",
            "name": "Arm Burnout",
            "rounds": 2,
            "restAfterRoundSec": 45,
            "durationSec": null,
            "exercises": [
              {
                "name": "Incline DB Curl",
                "targetReps": "12-15",
                "targetRpe": 9
              },
              {
                "name": "Rope Pushdown",
                "targetReps": "12-15",
                "targetRpe": 9
              }
            ],
            "note": "Biceps then triceps, back to back"
          }
        ],
        "conditioning": [
          {
            "name": "Incline Walk",
            "detail": "20 min zone 2 after lifting, incline 8-12%. Skip only if badminton actually happened."
          }
        ],
        "mobility": [],
        "sport": [
          {
            "name": "Badminton",
            "detail": "Bonus, not required. 5:30-7:00 AM. If played it REPLACES today's walk: lift after and add electrolytes + 30-50g carbs."
          }
        ],
        "notes": "First hard upper session. Quality reps over load. Direct biceps and triceps included. Log everything so next targets auto-calc. The walk is part of the plan, not an extra."
      },
      "2": {
        "key": "lowerA",
        "title": "Lower Body A",
        "focus": "Strength",
        "dayType": "training",
        "intensity": "Hard",
        "blocks": [
          {
            "blockType": "single",
            "name": "Back Squat",
            "exercises": [
              {
                "name": "Back Squat",
                "sets": 4,
                "repLow": 6,
                "repHigh": 8,
                "rpe": 7,
                "restSec": 180,
                "tempo": "3-1-1",
                "note": "Main squat. Arsenal Squat is the backup if the rack is taken"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Romanian Deadlift",
            "exercises": [
              {
                "name": "Romanian Deadlift",
                "sets": 4,
                "repLow": 8,
                "repHigh": 10,
                "rpe": 8,
                "restSec": 150,
                "tempo": "3-1-1",
                "note": "Hip hinge. Feel the hamstring stretch"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Hammer Strength Leg Press",
            "exercises": [
              {
                "name": "Hammer Strength Leg Press",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 8,
                "restSec": 120,
                "tempo": "2-0-1",
                "note": "Secondary quad and glute"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Seated Leg Curl",
            "exercises": [
              {
                "name": "Seated Leg Curl",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 9,
                "restSec": 90,
                "tempo": "2-1-1",
                "note": "Direct hamstring"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Standing Calf Raise",
            "exercises": [
              {
                "name": "Standing Calf Raise",
                "sets": 4,
                "repLow": 12,
                "repHigh": 15,
                "rpe": 9,
                "restSec": 60,
                "tempo": "2-1-2",
                "note": "Calves, full stretch and pause"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Bulgarian Split Squat",
            "exercises": [
              {
                "name": "Bulgarian Split Squat",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 8,
                "restSec": 90,
                "tempo": "2-0-1",
                "note": "Unilateral, per leg"
              }
            ]
          },
          {
            "blockType": "circuit",
            "name": "Core Circuit",
            "rounds": 3,
            "restAfterRoundSec": 60,
            "exercises": [
              {
                "name": "Hanging Leg Raise",
                "targetReps": "10-15",
                "targetRpe": 8
              },
              {
                "name": "Cable Woodchop",
                "targetReps": "10 / side",
                "targetRpe": 8
              }
            ],
            "note": "Core before the pool"
          }
        ],
        "conditioning": [],
        "mobility": [],
        "sport": [
          {
            "name": "Easy Laps",
            "detail": "Swimming class this evening. Technique-focused, legs already worked."
          }
        ],
        "notes": "Swim class tonight. Fuel carbs around the swim and hydrate well."
      },
      "3": {
        "key": "coreRecovery",
        "title": "Core + Recovery",
        "focus": "Active Recovery",
        "dayType": "rest",
        "intensity": "Light",
        "blocks": [
          {
            "blockType": "circuit",
            "name": "Core Circuit",
            "rounds": 3,
            "restAfterRoundSec": 60,
            "exercises": [
              {
                "name": "Cable Crunch",
                "targetReps": "12-15",
                "targetRpe": 8
              },
              {
                "name": "Pallof Press",
                "targetReps": "10 / side",
                "targetRpe": 7
              },
              {
                "name": "Dead Bug",
                "targetReps": "8-10",
                "targetRpe": 6
              },
              {
                "name": "Plank",
                "targetReps": "30-45s",
                "targetRpe": 6
              }
            ],
            "note": "Move station to station, rest 60s after the full round"
          }
        ],
        "conditioning": [
          {
            "name": "Incline Walk",
            "detail": "20 min zone 2, incline 8-12%. Do this first as the warm-up for the intervals."
          },
          {
            "name": "Bike",
            "detail": "Intervals: 8 x (1 min hard / 1 min easy), ~16 min. The only hard cardio of the week. Bike, not sprints — no impact, no next-day soreness, so it will not touch Sunday legs. This is the one session to cut first if sleep or recovery slips."
          }
        ],
        "mobility": [
          {
            "name": "Hip Flexor Stretch",
            "detail": "2 x 30s per side"
          },
          {
            "name": "Thoracic Rotation",
            "detail": "2 x 8 per side"
          },
          {
            "name": "Foam Rolling",
            "detail": "Quads, back, calves"
          }
        ],
        "sport": [
          {
            "name": "Badminton",
            "detail": "Bonus, not required. If played, shorten the walk to 15 min so this stays a recovery day."
          }
        ],
        "notes": "No lifting today, which is exactly why the week's one hard cardio session sits here — Thursday is a fast and swim, so there are two easy days before Sunday legs. Everything else stays deliberately easy: keep steps and water up."
      },
      "4": {
        "key": "fastRest",
        "title": "Fast + Recovery",
        "focus": "Rest + Swim",
        "dayType": "fastThu",
        "intensity": "Recovery",
        "blocks": [],
        "conditioning": [
          {
            "name": "Easy Laps",
            "detail": "Swimming class this evening, easy to moderate."
          }
        ],
        "mobility": [
          {
            "name": "Shoulder Mobility",
            "detail": "2 x 10 slow passes"
          },
          {
            "name": "Hamstring Stretch",
            "detail": "2 x 30s per side"
          },
          {
            "name": "Foam Rolling",
            "detail": "Full body, gentle"
          }
        ],
        "sport": [],
        "notes": "Fasting until 6 PM: water, black coffee, green tea only. Emergency = one fruit OR one glass of milk. No heavy lifting. Break the fast gently, protein first."
      },
      "5": {
        "key": "upperB",
        "title": "Upper Body B",
        "focus": "Hypertrophy",
        "dayType": "training",
        "intensity": "Hard",
        "blocks": [
          {
            "blockType": "single",
            "name": "Hammer Strength Incline Press",
            "exercises": [
              {
                "name": "Hammer Strength Incline Press",
                "sets": 4,
                "repLow": 8,
                "repHigh": 10,
                "rpe": 8,
                "restSec": 120,
                "tempo": "3-1-1",
                "note": "Main upper chest press"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Hammer Strength Row",
            "exercises": [
              {
                "name": "Hammer Strength Row",
                "sets": 4,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 8,
                "restSec": 90,
                "tempo": "2-1-1",
                "note": "Back thickness"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Chest-Assisted Dip",
            "exercises": [
              {
                "name": "Chest-Assisted Dip",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 8,
                "restSec": 90,
                "tempo": "3-1-1",
                "note": "Lower-chest machine press. Keep 2 reps in reserve and use a pain-free depth"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Body Builder Standing Press",
            "exercises": [
              {
                "name": "Body Builder Standing Press",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 8,
                "restSec": 90,
                "tempo": "2-0-1",
                "note": "Overhead shoulder press"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Incline DB Curl",
            "exercises": [
              {
                "name": "Incline DB Curl",
                "sets": 3,
                "repLow": 10,
                "repHigh": 12,
                "rpe": 9,
                "restSec": 75,
                "tempo": "2-0-1",
                "note": "Direct biceps, long-head stretch"
              }
            ]
          },
          {
            "blockType": "single",
            "name": "Overhead Tricep Extension",
            "exercises": [
              {
                "name": "Overhead Tricep Extension",
                "sets": 3,
                "repLow": 12,
                "repHigh": 15,
                "rpe": 9,
                "restSec": 75,
                "tempo": "2-1-2",
                "note": "Direct triceps, long head"
              }
            ]
          },
          {
            "blockType": "superset",
            "name": "Lateral + Rear Delt",
            "rounds": 3,
            "restAfterRoundSec": 60,
            "exercises": [
              {
                "name": "Arsenal Standing Lateral Raise",
                "targetReps": "12-15",
                "targetRpe": 9
              },
              {
                "name": "Rear Delt Fly",
                "targetReps": "15-20",
                "targetRpe": 9
              }
            ],
            "note": "Side and rear delts, no rest between"
          },
          {
            "blockType": "finisher",
            "name": "Arm + Shoulder Finisher",
            "rounds": 2,
            "restAfterRoundSec": 45,
            "durationSec": null,
            "exercises": [
              {
                "name": "Hammer Curl",
                "targetReps": "12-15",
                "targetRpe": 9
              },
              {
                "name": "Rope Pushdown",
                "targetReps": "12-15",
                "targetRpe": 9
              }
            ],
            "note": ""
          }
        ],
        "conditioning": [
          {
            "name": "Incline Walk",
            "detail": "20 min zone 2 after lifting, incline 8-12%. Skip only if badminton actually happened."
          }
        ],
        "mobility": [],
        "sport": [
          {
            "name": "Badminton",
            "detail": "Bonus, not required. If played it REPLACES today's walk: lift after and refuel."
          }
        ],
        "notes": "Pump-focused with direct arms. Controlled tempo, add reps before adding weight. Finish with the walk."
      },
      "6": {
        "key": "saturday",
        "title": "BodyBalance",
        "focus": "Mobility Class",
        "dayType": "vegSat",
        "intensity": "Light",
        "isClassDay": true,
        "blocks": [],
        "conditioning": [
          {
            "name": "Incline Walk",
            "detail": "25 min zone 2. Do it whether or not BodyBalance happens — the class is mobility, not conditioning."
          }
        ],
        "mobility": [
          {
            "name": "BodyBalance Class",
            "detail": "Les Mills BodyBalance, 45-55 min. Yoga, tai chi and pilates blend for flexibility, balance and core."
          }
        ],
        "sport": [],
        "notes": "Vegetarian day. If BodyBalance is missed, switch to the Full Body fallback below and keep protein high (whey, paneer, dal, Greek yogurt).",
        "fallback": {
          "key": "saturdayFallback",
          "title": "Full Body Pump (fallback)",
          "focus": "Full Body",
          "dayType": "vegSat",
          "intensity": "Moderate",
          "blocks": [
            {
              "blockType": "single",
              "name": "Hammer Strength Leg Press",
              "exercises": [
                {
                  "name": "Hammer Strength Leg Press",
                  "sets": 3,
                  "repLow": 12,
                  "repHigh": 15,
                  "rpe": 8,
                  "restSec": 90,
                  "tempo": "2-0-1",
                  "note": "Legs"
                }
              ]
            },
            {
              "blockType": "single",
              "name": "Hammer Strength Bench Press",
              "exercises": [
                {
                  "name": "Hammer Strength Bench Press",
                  "sets": 3,
                  "repLow": 10,
                  "repHigh": 12,
                  "rpe": 8,
                  "restSec": 90,
                  "tempo": "2-1-1",
                  "note": "Chest"
                }
              ]
            },
            {
              "blockType": "single",
              "name": "Hammer Strength Row",
              "exercises": [
                {
                  "name": "Hammer Strength Row",
                  "sets": 3,
                  "repLow": 10,
                  "repHigh": 12,
                  "rpe": 8,
                  "restSec": 90,
                  "tempo": "2-1-1",
                  "note": "Back"
                }
              ]
            },
            {
              "blockType": "single",
              "name": "Hammer Strength Iso Shoulder Press",
              "exercises": [
                {
                  "name": "Hammer Strength Iso Shoulder Press",
                  "sets": 3,
                  "repLow": 10,
                  "repHigh": 12,
                  "rpe": 8,
                  "restSec": 75,
                  "tempo": "2-0-1",
                  "note": "Shoulders"
                }
              ]
            },
            {
              "blockType": "superset",
              "name": "Curl + Pushdown",
              "rounds": 3,
              "restAfterRoundSec": 45,
              "exercises": [
                {
                  "name": "Life Fitness Bicep Curl",
                  "targetReps": "12-15",
                  "targetRpe": 9
                },
                {
                  "name": "Life Fitness Tricep Press",
                  "targetReps": "12-15",
                  "targetRpe": 9
                }
              ],
              "note": "Direct arms superset"
            },
            {
              "blockType": "circuit",
              "name": "Core Finisher",
              "rounds": 3,
              "restAfterRoundSec": 45,
              "exercises": [
                {
                  "name": "Hanging Leg Raise",
                  "targetReps": "10-15",
                  "targetRpe": 8
                },
                {
                  "name": "Cable Woodchop",
                  "targetReps": "10 / side",
                  "targetRpe": 8
                }
              ],
              "note": ""
            }
          ],
          "conditioning": [],
          "mobility": [],
          "sport": [],
          "notes": "Vegetarian day fallback. Moderate full-body pump, do not clash with Sunday legs."
        }
      }
    },
    "rationale": "Chosen split: 4-day Upper / Lower hybrid around swimming and one mobility class. After a 40-day layoff and while eating in a fat-loss deficit, recovery is the limiter, so a 6-day PPL is too much. Upper / Lower hits every muscle about 2x per week at moderate volume, which is the sweet spot for holding muscle while losing fat. Conditioning is now SCHEDULED, not assumed: five zone 2 walks (20 min after Mon and Fri lifts, 20 min Wed, 25 min Sat, 15 min Sun) plus the Tuesday and Thursday swims. Wednesday also carries the single hard cardio session of the week, 8 x 1 min bike intervals. It is there because Wednesday has no lifting and Thursday is a fast plus easy swim, so it costs the least recovery, and because zone 2 walking alone does not move VO2 max — which this app tracks but nothing else addresses. Bike over sprints keeps it non-impact. Cut this first if recovery slips. The earlier version leaned on optional morning badminton to cover conditioning. That badminton never happened, so the real activity level came in far below what the Evolt scan assumed and the plan quietly stopped working. Badminton is still welcome as a bonus and simply replaces that day's walk when it happens, but nothing in the plan depends on it any more. Thursday stays a true recovery day (fast + no heavy lifting + swim). Saturday is the BodyBalance mobility slot with a lifting fallback."
  },
);
