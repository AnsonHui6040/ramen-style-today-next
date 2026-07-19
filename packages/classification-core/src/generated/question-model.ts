import { deepFreeze } from '../contracts/deep-freeze.js'

const compiledQuestionModel = {
  "dependentClosures": {
    "archetype": [
      "tare",
      "source",
      "body",
      "noodle",
      "signature"
    ],
    "body": [],
    "exclusions": [],
    "form": [
      "archetype",
      "tare",
      "source",
      "body",
      "noodle",
      "signature"
    ],
    "noodle": [],
    "signature": [],
    "source": [],
    "tare": []
  },
  "forcedIterationUpperBound": 62,
  "metadata": {
    "compilerVersion": "1",
    "modelVersion": "batch2a.1.0",
    "schemaVersion": "1",
    "semanticHash": "d1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d",
    "sourceHash": "fbf0b82dc9515e43286a3c08b0bd0a0f5da3cf8a39d5baa8857b2d7603fc4d97"
  },
  "questions": [
    {
      "allowedOptions": [],
      "id": "form",
      "initialUiOptionIds": [],
      "messageIds": {
        "description": "question-form-description",
        "title": "question-form-title"
      },
      "options": [
        {
          "exclusive": false,
          "id": "soup",
          "messageIds": {
            "description": "option-form-soup-description",
            "label": "option-form-soup-label"
          },
          "order": 0
        },
        {
          "exclusive": false,
          "id": "tsukemen",
          "messageIds": {
            "description": "option-form-tsukemen-description",
            "label": "option-form-tsukemen-label"
          },
          "order": 1
        },
        {
          "exclusive": false,
          "id": "dry",
          "messageIds": {
            "description": "option-form-dry-description",
            "label": "option-form-dry-label"
          },
          "order": 2
        }
      ],
      "order": 0,
      "pendingSelection": {
        "emptyBehavior": {
          "type": "allow-empty"
        }
      },
      "selection": {
        "max": 1,
        "min": 1,
        "overrides": [],
        "type": "single"
      },
      "validSelectionKeys": [
        "[\"dry\"]",
        "[\"soup\"]",
        "[\"tsukemen\"]"
      ],
      "weight": 16
    },
    {
      "allowedOptions": [
        {
          "selection": {
            "optionIds": [
              "chintan",
              "paitan"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "soup",
            "questionId": "form",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "konbusui-light",
              "gyokai-rich",
              "miso-rich",
              "tsukemen-other"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "tsukemen",
            "questionId": "form",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "aburasoba",
              "taiwan-mazesoba",
              "soupless-tantan",
              "dry-other"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "dry",
            "questionId": "form",
            "type": "answer-includes"
          }
        }
      ],
      "availableWhen": {
        "questionId": "form",
        "type": "answered"
      },
      "id": "archetype",
      "initialUiOptionIds": [],
      "messageIds": {
        "description": "question-archetype-description",
        "title": "question-archetype-title"
      },
      "options": [
        {
          "exclusive": false,
          "id": "chintan",
          "messageIds": {
            "description": "option-archetype-chintan-description",
            "label": "option-archetype-chintan-label"
          },
          "order": 0
        },
        {
          "exclusive": false,
          "id": "paitan",
          "messageIds": {
            "description": "option-archetype-paitan-description",
            "label": "option-archetype-paitan-label"
          },
          "order": 1
        },
        {
          "exclusive": false,
          "id": "konbusui-light",
          "messageIds": {
            "description": "option-archetype-konbusui-light-description",
            "label": "option-archetype-konbusui-light-label"
          },
          "order": 2
        },
        {
          "exclusive": false,
          "id": "gyokai-rich",
          "messageIds": {
            "description": "option-archetype-gyokai-rich-description",
            "label": "option-archetype-gyokai-rich-label"
          },
          "order": 3
        },
        {
          "exclusive": false,
          "id": "miso-rich",
          "messageIds": {
            "description": "option-archetype-miso-rich-description",
            "label": "option-archetype-miso-rich-label"
          },
          "order": 4
        },
        {
          "exclusive": false,
          "id": "tsukemen-other",
          "messageIds": {
            "description": "option-archetype-tsukemen-other-description",
            "label": "option-archetype-tsukemen-other-label"
          },
          "order": 5
        },
        {
          "exclusive": false,
          "id": "aburasoba",
          "messageIds": {
            "description": "option-archetype-aburasoba-description",
            "label": "option-archetype-aburasoba-label"
          },
          "order": 6
        },
        {
          "exclusive": false,
          "id": "taiwan-mazesoba",
          "messageIds": {
            "description": "option-archetype-taiwan-mazesoba-description",
            "label": "option-archetype-taiwan-mazesoba-label"
          },
          "order": 7
        },
        {
          "exclusive": false,
          "id": "soupless-tantan",
          "messageIds": {
            "description": "option-archetype-soupless-tantan-description",
            "label": "option-archetype-soupless-tantan-label"
          },
          "order": 8
        },
        {
          "exclusive": false,
          "id": "dry-other",
          "messageIds": {
            "description": "option-archetype-dry-other-description",
            "label": "option-archetype-dry-other-label"
          },
          "order": 9
        }
      ],
      "order": 1,
      "pendingSelection": {
        "emptyBehavior": {
          "type": "allow-empty"
        }
      },
      "selection": {
        "max": 1,
        "min": 1,
        "overrides": [],
        "type": "single"
      },
      "validSelectionKeys": [
        "[\"aburasoba\"]",
        "[\"chintan\"]",
        "[\"dry-other\"]",
        "[\"gyokai-rich\"]",
        "[\"konbusui-light\"]",
        "[\"miso-rich\"]",
        "[\"paitan\"]",
        "[\"soupless-tantan\"]",
        "[\"taiwan-mazesoba\"]",
        "[\"tsukemen-other\"]"
      ],
      "weight": 16
    },
    {
      "allowedOptions": [
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "chintan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "paitan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "shoyu",
              "shio"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "konbusui-light",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "shoyu",
              "shio",
              "miso"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "gyokai-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "miso"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "miso-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "tsukemen-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "shoyu",
              "none"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "aburasoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "shoyu",
              "spicy-sesame",
              "none"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "taiwan-mazesoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "spicy-sesame"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "soupless-tantan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "dry-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        }
      ],
      "autoAnswer": {
        "type": "single-allowed-option"
      },
      "availableWhen": {
        "questionId": "archetype",
        "type": "answered"
      },
      "id": "tare",
      "initialUiOptionIds": [],
      "messageIds": {
        "description": "question-tare-description",
        "title": "question-tare-title"
      },
      "options": [
        {
          "exclusive": false,
          "id": "shoyu",
          "messageIds": {
            "description": "option-tare-shoyu-description",
            "label": "option-tare-shoyu-label"
          },
          "order": 0
        },
        {
          "exclusive": false,
          "id": "shio",
          "messageIds": {
            "description": "option-tare-shio-description",
            "label": "option-tare-shio-label"
          },
          "order": 1
        },
        {
          "exclusive": false,
          "id": "miso",
          "messageIds": {
            "description": "option-tare-miso-description",
            "label": "option-tare-miso-label"
          },
          "order": 2
        },
        {
          "exclusive": false,
          "id": "spicy-sesame",
          "messageIds": {
            "description": "option-tare-spicy-sesame-description",
            "label": "option-tare-spicy-sesame-label"
          },
          "order": 3
        },
        {
          "exclusive": false,
          "id": "none",
          "messageIds": {
            "description": "option-tare-none-description",
            "label": "option-tare-none-label"
          },
          "order": 4
        }
      ],
      "order": 2,
      "pendingSelection": {
        "emptyBehavior": {
          "type": "allow-empty"
        }
      },
      "selection": {
        "max": 1,
        "min": 1,
        "overrides": [],
        "type": "single"
      },
      "validSelectionKeys": [
        "[\"miso\"]",
        "[\"none\"]",
        "[\"shio\"]",
        "[\"shoyu\"]",
        "[\"spicy-sesame\"]"
      ],
      "weight": 15
    },
    {
      "allowedOptions": [
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "chintan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "paitan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "fish-seafood",
              "shellfish",
              "vegetable",
              "mixed",
              "unsure"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "konbusui-light",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "fish-seafood",
              "shellfish",
              "mixed",
              "unsure"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "gyokai-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "pork",
              "chicken",
              "fish-seafood",
              "vegetable",
              "mixed",
              "unsure"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "miso-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "tsukemen-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "pork",
              "mixed",
              "unsure"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "aburasoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "pork",
              "mixed",
              "unsure"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "taiwan-mazesoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "pork",
              "vegetable",
              "mixed",
              "unsure"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "soupless-tantan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "dry-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        }
      ],
      "autoAnswer": {
        "type": "single-allowed-option"
      },
      "availableWhen": {
        "questionId": "archetype",
        "type": "answered"
      },
      "id": "source",
      "initialUiOptionIds": [],
      "messageIds": {
        "description": "question-source-description",
        "title": "question-source-title"
      },
      "options": [
        {
          "exclusive": false,
          "id": "pork",
          "messageIds": {
            "description": "option-source-pork-description",
            "label": "option-source-pork-label"
          },
          "order": 0
        },
        {
          "exclusive": false,
          "id": "chicken",
          "messageIds": {
            "description": "option-source-chicken-description",
            "label": "option-source-chicken-label"
          },
          "order": 1
        },
        {
          "exclusive": false,
          "id": "duck",
          "messageIds": {
            "description": "option-source-duck-description",
            "label": "option-source-duck-label"
          },
          "order": 2
        },
        {
          "exclusive": false,
          "id": "beef",
          "messageIds": {
            "description": "option-source-beef-description",
            "label": "option-source-beef-label"
          },
          "order": 3
        },
        {
          "exclusive": false,
          "id": "fish-seafood",
          "messageIds": {
            "description": "option-source-fish-seafood-description",
            "label": "option-source-fish-seafood-label"
          },
          "order": 4
        },
        {
          "exclusive": false,
          "id": "shellfish",
          "messageIds": {
            "description": "option-source-shellfish-description",
            "label": "option-source-shellfish-label"
          },
          "order": 5
        },
        {
          "exclusive": false,
          "id": "shrimp-crab",
          "messageIds": {
            "description": "option-source-shrimp-crab-description",
            "label": "option-source-shrimp-crab-label"
          },
          "order": 6
        },
        {
          "exclusive": false,
          "id": "vegetable",
          "messageIds": {
            "description": "option-source-vegetable-description",
            "label": "option-source-vegetable-label"
          },
          "order": 7
        },
        {
          "exclusive": false,
          "id": "mixed",
          "messageIds": {
            "description": "option-source-mixed-description",
            "label": "option-source-mixed-label"
          },
          "order": 8
        },
        {
          "exclusive": true,
          "id": "unsure",
          "messageIds": {
            "description": "option-source-unsure-description",
            "label": "option-source-unsure-label"
          },
          "order": 9
        }
      ],
      "order": 3,
      "pendingSelection": {
        "emptyBehavior": {
          "type": "allow-empty"
        }
      },
      "selection": {
        "max": 2,
        "min": 1,
        "overrides": [],
        "type": "multiple"
      },
      "validSelectionKeys": [
        "[\"beef\",\"fish-seafood\"]",
        "[\"beef\",\"mixed\"]",
        "[\"beef\",\"shellfish\"]",
        "[\"beef\",\"shrimp-crab\"]",
        "[\"beef\",\"vegetable\"]",
        "[\"beef\"]",
        "[\"chicken\",\"beef\"]",
        "[\"chicken\",\"duck\"]",
        "[\"chicken\",\"fish-seafood\"]",
        "[\"chicken\",\"mixed\"]",
        "[\"chicken\",\"shellfish\"]",
        "[\"chicken\",\"shrimp-crab\"]",
        "[\"chicken\",\"vegetable\"]",
        "[\"chicken\"]",
        "[\"duck\",\"beef\"]",
        "[\"duck\",\"fish-seafood\"]",
        "[\"duck\",\"mixed\"]",
        "[\"duck\",\"shellfish\"]",
        "[\"duck\",\"shrimp-crab\"]",
        "[\"duck\",\"vegetable\"]",
        "[\"duck\"]",
        "[\"fish-seafood\",\"mixed\"]",
        "[\"fish-seafood\",\"shellfish\"]",
        "[\"fish-seafood\",\"shrimp-crab\"]",
        "[\"fish-seafood\",\"vegetable\"]",
        "[\"fish-seafood\"]",
        "[\"mixed\"]",
        "[\"pork\",\"beef\"]",
        "[\"pork\",\"chicken\"]",
        "[\"pork\",\"duck\"]",
        "[\"pork\",\"fish-seafood\"]",
        "[\"pork\",\"mixed\"]",
        "[\"pork\",\"shellfish\"]",
        "[\"pork\",\"shrimp-crab\"]",
        "[\"pork\",\"vegetable\"]",
        "[\"pork\"]",
        "[\"shellfish\",\"mixed\"]",
        "[\"shellfish\",\"shrimp-crab\"]",
        "[\"shellfish\",\"vegetable\"]",
        "[\"shellfish\"]",
        "[\"shrimp-crab\",\"mixed\"]",
        "[\"shrimp-crab\",\"vegetable\"]",
        "[\"shrimp-crab\"]",
        "[\"unsure\"]",
        "[\"vegetable\",\"mixed\"]",
        "[\"vegetable\"]"
      ],
      "weight": 18
    },
    {
      "allowedOptions": [
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "chintan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "paitan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "light",
              "balanced"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "konbusui-light",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "balanced",
              "rich",
              "ultra-heavy"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "gyokai-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "balanced",
              "rich",
              "ultra-heavy"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "miso-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "tsukemen-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "light",
              "balanced",
              "rich"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "aburasoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "balanced",
              "rich",
              "ultra-heavy"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "taiwan-mazesoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "balanced",
              "rich",
              "ultra-heavy"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "soupless-tantan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "dry-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        }
      ],
      "autoAnswer": {
        "type": "single-allowed-option"
      },
      "availableWhen": {
        "questionId": "archetype",
        "type": "answered"
      },
      "id": "body",
      "initialUiOptionIds": [],
      "messageIds": {
        "description": "question-body-description",
        "title": "question-body-title"
      },
      "options": [
        {
          "exclusive": false,
          "id": "light",
          "messageIds": {
            "description": "option-body-light-description",
            "label": "option-body-light-label"
          },
          "order": 0
        },
        {
          "exclusive": false,
          "id": "balanced",
          "messageIds": {
            "description": "option-body-balanced-description",
            "label": "option-body-balanced-label"
          },
          "order": 1
        },
        {
          "exclusive": false,
          "id": "rich",
          "messageIds": {
            "description": "option-body-rich-description",
            "label": "option-body-rich-label"
          },
          "order": 2
        },
        {
          "exclusive": false,
          "id": "backfat-heavy",
          "messageIds": {
            "description": "option-body-backfat-heavy-description",
            "label": "option-body-backfat-heavy-label"
          },
          "order": 3
        },
        {
          "exclusive": false,
          "id": "ultra-heavy",
          "messageIds": {
            "description": "option-body-ultra-heavy-description",
            "label": "option-body-ultra-heavy-label"
          },
          "order": 4
        }
      ],
      "order": 4,
      "pendingSelection": {
        "emptyBehavior": {
          "type": "allow-empty"
        }
      },
      "selection": {
        "max": 1,
        "min": 1,
        "overrides": [],
        "type": "single"
      },
      "validSelectionKeys": [
        "[\"backfat-heavy\"]",
        "[\"balanced\"]",
        "[\"light\"]",
        "[\"rich\"]",
        "[\"ultra-heavy\"]"
      ],
      "weight": 14
    },
    {
      "allowedOptions": [
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "chintan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "paitan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "medium-thin-straight",
              "medium-thick-straight"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "konbusui-light",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "medium-thick-straight",
              "medium-thick-wavy",
              "extra-thick"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "gyokai-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "medium-thick-straight",
              "medium-thick-wavy",
              "extra-thick"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "miso-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "tsukemen-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "medium-thin-straight",
              "medium-thick-straight",
              "extra-thick"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "aburasoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "medium-thick-straight",
              "extra-thick"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "taiwan-mazesoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "medium-thick-straight",
              "extra-thick"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "soupless-tantan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "dry-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        }
      ],
      "autoAnswer": {
        "type": "single-allowed-option"
      },
      "availableWhen": {
        "questionId": "archetype",
        "type": "answered"
      },
      "id": "noodle",
      "initialUiOptionIds": [],
      "messageIds": {
        "description": "question-noodle-description",
        "title": "question-noodle-title"
      },
      "options": [
        {
          "exclusive": false,
          "id": "thin-straight",
          "messageIds": {
            "description": "option-noodle-thin-straight-description",
            "label": "option-noodle-thin-straight-label"
          },
          "order": 0
        },
        {
          "exclusive": false,
          "id": "medium-thin-straight",
          "messageIds": {
            "description": "option-noodle-medium-thin-straight-description",
            "label": "option-noodle-medium-thin-straight-label"
          },
          "order": 1
        },
        {
          "exclusive": false,
          "id": "medium-thick-straight",
          "messageIds": {
            "description": "option-noodle-medium-thick-straight-description",
            "label": "option-noodle-medium-thick-straight-label"
          },
          "order": 2
        },
        {
          "exclusive": false,
          "id": "medium-thick-wavy",
          "messageIds": {
            "description": "option-noodle-medium-thick-wavy-description",
            "label": "option-noodle-medium-thick-wavy-label"
          },
          "order": 3
        },
        {
          "exclusive": false,
          "id": "extra-thick",
          "messageIds": {
            "description": "option-noodle-extra-thick-description",
            "label": "option-noodle-extra-thick-label"
          },
          "order": 4
        }
      ],
      "order": 5,
      "pendingSelection": {
        "emptyBehavior": {
          "type": "allow-empty"
        }
      },
      "selection": {
        "max": 1,
        "min": 1,
        "overrides": [],
        "type": "single"
      },
      "validSelectionKeys": [
        "[\"extra-thick\"]",
        "[\"medium-thick-straight\"]",
        "[\"medium-thick-wavy\"]",
        "[\"medium-thin-straight\"]",
        "[\"thin-straight\"]"
      ],
      "weight": 11
    },
    {
      "allowedOptions": [
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "chintan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "paitan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "fish-kombu",
              "yuzu-citrus",
              "no-preference"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "konbusui-light",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "fish-kombu",
              "no-preference"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "gyokai-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "corn-butter",
              "fish-kombu",
              "no-preference"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "miso-rich",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "tsukemen-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "bean-sprout-garlic-backfat",
              "fish-kombu",
              "no-preference"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "aburasoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "bean-sprout-garlic-backfat",
              "fish-kombu",
              "no-preference"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "taiwan-mazesoba",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "optionIds": [
              "bean-sprout-garlic-backfat",
              "no-preference"
            ],
            "type": "only"
          },
          "when": {
            "optionId": "soupless-tantan",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        },
        {
          "selection": {
            "type": "all"
          },
          "when": {
            "optionId": "dry-other",
            "questionId": "archetype",
            "type": "answer-includes"
          }
        }
      ],
      "autoAnswer": {
        "type": "single-allowed-option"
      },
      "availableWhen": {
        "questionId": "archetype",
        "type": "answered"
      },
      "id": "signature",
      "initialUiOptionIds": [],
      "messageIds": {
        "description": "question-signature-description",
        "title": "question-signature-title"
      },
      "options": [
        {
          "exclusive": false,
          "id": "nori-spinach",
          "messageIds": {
            "description": "option-signature-nori-spinach-description",
            "label": "option-signature-nori-spinach-label"
          },
          "order": 0
        },
        {
          "exclusive": false,
          "id": "corn-butter",
          "messageIds": {
            "description": "option-signature-corn-butter-description",
            "label": "option-signature-corn-butter-label"
          },
          "order": 1
        },
        {
          "exclusive": false,
          "id": "bean-sprout-garlic-backfat",
          "messageIds": {
            "description": "option-signature-bean-sprout-garlic-backfat-description",
            "label": "option-signature-bean-sprout-garlic-backfat-label"
          },
          "order": 2
        },
        {
          "exclusive": false,
          "id": "fish-kombu",
          "messageIds": {
            "description": "option-signature-fish-kombu-description",
            "label": "option-signature-fish-kombu-label"
          },
          "order": 3
        },
        {
          "exclusive": false,
          "id": "yuzu-citrus",
          "messageIds": {
            "description": "option-signature-yuzu-citrus-description",
            "label": "option-signature-yuzu-citrus-label"
          },
          "order": 4
        },
        {
          "exclusive": true,
          "id": "no-preference",
          "messageIds": {
            "description": "option-signature-no-preference-description",
            "label": "option-signature-no-preference-label"
          },
          "order": 5
        }
      ],
      "order": 6,
      "pendingSelection": {
        "emptyBehavior": {
          "type": "allow-empty"
        }
      },
      "selection": {
        "max": 2,
        "min": 1,
        "overrides": [],
        "type": "multiple"
      },
      "validSelectionKeys": [
        "[\"bean-sprout-garlic-backfat\",\"fish-kombu\"]",
        "[\"bean-sprout-garlic-backfat\",\"yuzu-citrus\"]",
        "[\"bean-sprout-garlic-backfat\"]",
        "[\"corn-butter\",\"bean-sprout-garlic-backfat\"]",
        "[\"corn-butter\",\"fish-kombu\"]",
        "[\"corn-butter\",\"yuzu-citrus\"]",
        "[\"corn-butter\"]",
        "[\"fish-kombu\",\"yuzu-citrus\"]",
        "[\"fish-kombu\"]",
        "[\"no-preference\"]",
        "[\"nori-spinach\",\"bean-sprout-garlic-backfat\"]",
        "[\"nori-spinach\",\"corn-butter\"]",
        "[\"nori-spinach\",\"fish-kombu\"]",
        "[\"nori-spinach\",\"yuzu-citrus\"]",
        "[\"nori-spinach\"]",
        "[\"yuzu-citrus\"]"
      ],
      "weight": 10
    },
    {
      "allowedOptions": [],
      "id": "exclusions",
      "initialUiOptionIds": [
        "none"
      ],
      "messageIds": {
        "description": "question-exclusions-description",
        "title": "question-exclusions-title"
      },
      "options": [
        {
          "exclusive": false,
          "id": "pork",
          "messageIds": {
            "description": "option-exclusions-pork-description",
            "label": "option-exclusions-pork-label"
          },
          "order": 0
        },
        {
          "exclusive": false,
          "id": "chicken",
          "messageIds": {
            "description": "option-exclusions-chicken-description",
            "label": "option-exclusions-chicken-label"
          },
          "order": 1
        },
        {
          "exclusive": false,
          "id": "duck",
          "messageIds": {
            "description": "option-exclusions-duck-description",
            "label": "option-exclusions-duck-label"
          },
          "order": 2
        },
        {
          "exclusive": false,
          "id": "beef",
          "messageIds": {
            "description": "option-exclusions-beef-description",
            "label": "option-exclusions-beef-label"
          },
          "order": 3
        },
        {
          "exclusive": false,
          "id": "fish-seafood",
          "messageIds": {
            "description": "option-exclusions-fish-seafood-description",
            "label": "option-exclusions-fish-seafood-label"
          },
          "order": 4
        },
        {
          "exclusive": false,
          "id": "shellfish",
          "messageIds": {
            "description": "option-exclusions-shellfish-description",
            "label": "option-exclusions-shellfish-label"
          },
          "order": 5
        },
        {
          "exclusive": false,
          "id": "shrimp-crab",
          "messageIds": {
            "description": "option-exclusions-shrimp-crab-description",
            "label": "option-exclusions-shrimp-crab-label"
          },
          "order": 6
        },
        {
          "exclusive": false,
          "id": "dairy",
          "messageIds": {
            "description": "option-exclusions-dairy-description",
            "label": "option-exclusions-dairy-label"
          },
          "order": 7
        },
        {
          "exclusive": true,
          "id": "none",
          "messageIds": {
            "description": "option-exclusions-none-description",
            "label": "option-exclusions-none-label"
          },
          "order": 8
        }
      ],
      "order": 7,
      "pendingSelection": {
        "emptyBehavior": {
          "type": "restore-initial-ui-options"
        }
      },
      "selection": {
        "max": 8,
        "min": 1,
        "overrides": [],
        "type": "multiple"
      },
      "validSelectionKeys": [
        "[\"beef\",\"dairy\"]",
        "[\"beef\",\"fish-seafood\",\"dairy\"]",
        "[\"beef\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"beef\",\"fish-seafood\",\"shellfish\"]",
        "[\"beef\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"beef\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"beef\",\"fish-seafood\"]",
        "[\"beef\",\"shellfish\",\"dairy\"]",
        "[\"beef\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"beef\",\"shellfish\",\"shrimp-crab\"]",
        "[\"beef\",\"shellfish\"]",
        "[\"beef\",\"shrimp-crab\",\"dairy\"]",
        "[\"beef\",\"shrimp-crab\"]",
        "[\"beef\"]",
        "[\"chicken\",\"beef\",\"dairy\"]",
        "[\"chicken\",\"beef\",\"fish-seafood\",\"dairy\"]",
        "[\"chicken\",\"beef\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"chicken\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"chicken\",\"beef\",\"fish-seafood\",\"shellfish\"]",
        "[\"chicken\",\"beef\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"beef\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"chicken\",\"beef\",\"fish-seafood\"]",
        "[\"chicken\",\"beef\",\"shellfish\",\"dairy\"]",
        "[\"chicken\",\"beef\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"beef\",\"shellfish\",\"shrimp-crab\"]",
        "[\"chicken\",\"beef\",\"shellfish\"]",
        "[\"chicken\",\"beef\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"beef\",\"shrimp-crab\"]",
        "[\"chicken\",\"beef\"]",
        "[\"chicken\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"beef\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\"]",
        "[\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"chicken\",\"duck\",\"beef\",\"fish-seafood\"]",
        "[\"chicken\",\"duck\",\"beef\",\"shellfish\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"beef\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"beef\",\"shellfish\",\"shrimp-crab\"]",
        "[\"chicken\",\"duck\",\"beef\",\"shellfish\"]",
        "[\"chicken\",\"duck\",\"beef\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"beef\",\"shrimp-crab\"]",
        "[\"chicken\",\"duck\",\"beef\"]",
        "[\"chicken\",\"duck\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"fish-seafood\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"chicken\",\"duck\",\"fish-seafood\",\"shellfish\"]",
        "[\"chicken\",\"duck\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"chicken\",\"duck\",\"fish-seafood\"]",
        "[\"chicken\",\"duck\",\"shellfish\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"shellfish\",\"shrimp-crab\"]",
        "[\"chicken\",\"duck\",\"shellfish\"]",
        "[\"chicken\",\"duck\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"duck\",\"shrimp-crab\"]",
        "[\"chicken\",\"duck\"]",
        "[\"chicken\",\"fish-seafood\",\"dairy\"]",
        "[\"chicken\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"chicken\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"chicken\",\"fish-seafood\",\"shellfish\"]",
        "[\"chicken\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"chicken\",\"fish-seafood\"]",
        "[\"chicken\",\"shellfish\",\"dairy\"]",
        "[\"chicken\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"shellfish\",\"shrimp-crab\"]",
        "[\"chicken\",\"shellfish\"]",
        "[\"chicken\",\"shrimp-crab\",\"dairy\"]",
        "[\"chicken\",\"shrimp-crab\"]",
        "[\"chicken\"]",
        "[\"dairy\"]",
        "[\"duck\",\"beef\",\"dairy\"]",
        "[\"duck\",\"beef\",\"fish-seafood\",\"dairy\"]",
        "[\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"duck\",\"beef\",\"fish-seafood\",\"shellfish\"]",
        "[\"duck\",\"beef\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"duck\",\"beef\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"duck\",\"beef\",\"fish-seafood\"]",
        "[\"duck\",\"beef\",\"shellfish\",\"dairy\"]",
        "[\"duck\",\"beef\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"duck\",\"beef\",\"shellfish\",\"shrimp-crab\"]",
        "[\"duck\",\"beef\",\"shellfish\"]",
        "[\"duck\",\"beef\",\"shrimp-crab\",\"dairy\"]",
        "[\"duck\",\"beef\",\"shrimp-crab\"]",
        "[\"duck\",\"beef\"]",
        "[\"duck\",\"dairy\"]",
        "[\"duck\",\"fish-seafood\",\"dairy\"]",
        "[\"duck\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"duck\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"duck\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"duck\",\"fish-seafood\",\"shellfish\"]",
        "[\"duck\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"duck\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"duck\",\"fish-seafood\"]",
        "[\"duck\",\"shellfish\",\"dairy\"]",
        "[\"duck\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"duck\",\"shellfish\",\"shrimp-crab\"]",
        "[\"duck\",\"shellfish\"]",
        "[\"duck\",\"shrimp-crab\",\"dairy\"]",
        "[\"duck\",\"shrimp-crab\"]",
        "[\"duck\"]",
        "[\"fish-seafood\",\"dairy\"]",
        "[\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"fish-seafood\",\"shellfish\"]",
        "[\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"fish-seafood\",\"shrimp-crab\"]",
        "[\"fish-seafood\"]",
        "[\"none\"]",
        "[\"pork\",\"beef\",\"dairy\"]",
        "[\"pork\",\"beef\",\"fish-seafood\",\"dairy\"]",
        "[\"pork\",\"beef\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"beef\",\"fish-seafood\",\"shellfish\"]",
        "[\"pork\",\"beef\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"beef\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"pork\",\"beef\",\"fish-seafood\"]",
        "[\"pork\",\"beef\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"beef\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"beef\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"beef\",\"shellfish\"]",
        "[\"pork\",\"beef\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"beef\",\"shrimp-crab\"]",
        "[\"pork\",\"beef\"]",
        "[\"pork\",\"chicken\",\"beef\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"beef\",\"fish-seafood\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"beef\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"beef\",\"fish-seafood\",\"shellfish\"]",
        "[\"pork\",\"chicken\",\"beef\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"beef\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"beef\",\"fish-seafood\"]",
        "[\"pork\",\"chicken\",\"beef\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"beef\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"beef\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"beef\",\"shellfish\"]",
        "[\"pork\",\"chicken\",\"beef\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"beef\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"beef\"]",
        "[\"pork\",\"chicken\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"fish-seafood\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"shellfish\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"duck\",\"beef\"]",
        "[\"pork\",\"chicken\",\"duck\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"fish-seafood\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"duck\",\"fish-seafood\",\"shellfish\"]",
        "[\"pork\",\"chicken\",\"duck\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"duck\",\"fish-seafood\"]",
        "[\"pork\",\"chicken\",\"duck\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"duck\",\"shellfish\"]",
        "[\"pork\",\"chicken\",\"duck\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"duck\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"duck\"]",
        "[\"pork\",\"chicken\",\"fish-seafood\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"fish-seafood\",\"shellfish\"]",
        "[\"pork\",\"chicken\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"fish-seafood\"]",
        "[\"pork\",\"chicken\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\",\"shellfish\"]",
        "[\"pork\",\"chicken\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"chicken\",\"shrimp-crab\"]",
        "[\"pork\",\"chicken\"]",
        "[\"pork\",\"dairy\"]",
        "[\"pork\",\"duck\",\"beef\",\"dairy\"]",
        "[\"pork\",\"duck\",\"beef\",\"fish-seafood\",\"dairy\"]",
        "[\"pork\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"duck\",\"beef\",\"fish-seafood\",\"shellfish\"]",
        "[\"pork\",\"duck\",\"beef\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"duck\",\"beef\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"pork\",\"duck\",\"beef\",\"fish-seafood\"]",
        "[\"pork\",\"duck\",\"beef\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"duck\",\"beef\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"duck\",\"beef\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"duck\",\"beef\",\"shellfish\"]",
        "[\"pork\",\"duck\",\"beef\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"duck\",\"beef\",\"shrimp-crab\"]",
        "[\"pork\",\"duck\",\"beef\"]",
        "[\"pork\",\"duck\",\"dairy\"]",
        "[\"pork\",\"duck\",\"fish-seafood\",\"dairy\"]",
        "[\"pork\",\"duck\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"duck\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"duck\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"duck\",\"fish-seafood\",\"shellfish\"]",
        "[\"pork\",\"duck\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"duck\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"pork\",\"duck\",\"fish-seafood\"]",
        "[\"pork\",\"duck\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"duck\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"duck\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"duck\",\"shellfish\"]",
        "[\"pork\",\"duck\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"duck\",\"shrimp-crab\"]",
        "[\"pork\",\"duck\"]",
        "[\"pork\",\"fish-seafood\",\"dairy\"]",
        "[\"pork\",\"fish-seafood\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"fish-seafood\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"fish-seafood\",\"shellfish\"]",
        "[\"pork\",\"fish-seafood\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"fish-seafood\",\"shrimp-crab\"]",
        "[\"pork\",\"fish-seafood\"]",
        "[\"pork\",\"shellfish\",\"dairy\"]",
        "[\"pork\",\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"shellfish\",\"shrimp-crab\"]",
        "[\"pork\",\"shellfish\"]",
        "[\"pork\",\"shrimp-crab\",\"dairy\"]",
        "[\"pork\",\"shrimp-crab\"]",
        "[\"pork\"]",
        "[\"shellfish\",\"dairy\"]",
        "[\"shellfish\",\"shrimp-crab\",\"dairy\"]",
        "[\"shellfish\",\"shrimp-crab\"]",
        "[\"shellfish\"]",
        "[\"shrimp-crab\",\"dairy\"]",
        "[\"shrimp-crab\"]"
      ],
      "weight": 0
    }
  ],
  "semanticDependencies": {
    "archetype": [
      "form"
    ],
    "body": [
      "archetype"
    ],
    "exclusions": [],
    "form": [],
    "noodle": [
      "archetype"
    ],
    "signature": [
      "archetype"
    ],
    "source": [
      "archetype"
    ],
    "tare": [
      "archetype"
    ]
  },
  "topologicalOrder": [
    "form",
    "archetype",
    "tare",
    "source",
    "body",
    "noodle",
    "signature",
    "exclusions"
  ]
} as const

export const questionModel = deepFreeze(compiledQuestionModel)
