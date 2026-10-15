/* Approved local MPOWER baseline, with Production Control V2.9.16 mappings. */
(function (root) {
  const data = {
  "version": "MPOWER-2026-10-02+PC2.9.16",
  "rules": [
    {
      "structure": "HPC-BIP-A222",
      "code": "1HAND_POS",
      "percent": 30.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-A222",
      "code": "2INSTALL",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "code": "1ENDS_CUT",
      "percent": 10.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "code": "2PREP_TACK",
      "percent": 50.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "code": "3WELDING",
      "percent": 90.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "code": "4ITR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "code": "5ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 50,
      "active": true
    },
    {
      "structure": "HPC-BIP-CABLING",
      "code": "1INSTALL",
      "percent": 90.0,
      "policy": "Variable 0-90",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-CABLING",
      "code": "2ITR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-CABLING",
      "code": "3ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-CLAMPS",
      "code": "CP",
      "percent": 100.0,
      "policy": "Variable 0-100",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-CMSS",
      "code": "IP",
      "percent": 50.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-CMSS",
      "code": "CP",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-COATING",
      "code": "1COAT",
      "percent": 25.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-COATING",
      "code": "2COAT",
      "percent": 50.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-COATING",
      "code": "3COAT",
      "percent": 75.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-COATING",
      "code": "4COAT",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "HPC-BIP-DUCTING",
      "code": "1HAND_POS",
      "percent": 20.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-DUCTING",
      "code": "2INST_DUCT",
      "percent": 90.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-DUCTING",
      "code": "3ITR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-DUCTING",
      "code": "4ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "HPC-BIP-ELEC-CONT",
      "code": "1CUT_PREP",
      "percent": 60.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-ELEC-CONT",
      "code": "2BOLT_ALMT",
      "percent": 90.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-ELEC-CONT",
      "code": "3ITR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-ELEC-CONT",
      "code": "4ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "HPC-BIP-ELEC-SUPPORT",
      "code": "1ENDS_CUT",
      "percent": 10.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-ELEC-SUPPORT",
      "code": "2PREP_TACK",
      "percent": 50.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-ELEC-SUPPORT",
      "code": "3WELDING",
      "percent": 90.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-ELEC-SUPPORT",
      "code": "4ITR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "HPC-BIP-ELEC-SUPPORT",
      "code": "5ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 50,
      "active": true
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "code": "1_INT_PREP",
      "percent": 10.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "code": "2_1ST_INST",
      "percent": 30.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "code": "3_2ND_INST",
      "percent": 60.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "code": "4_ALIGN",
      "percent": 80.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "code": "5_FINAL",
      "percent": 90.0,
      "policy": "Fixed",
      "order": 50,
      "active": true
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "code": "6ITR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 60,
      "active": true
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "code": "7ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 70,
      "active": true
    },
    {
      "structure": "HPC-BIP-IED",
      "code": "1INSTALL",
      "percent": 90.0,
      "policy": "Variable 0-90",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-IED",
      "code": "2ITR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-IED",
      "code": "3ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "code": "1HAND_POS",
      "percent": 10.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "code": "2PREP_ALMT",
      "percent": 40.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "code": "3WELDING",
      "percent": 80.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "code": "4COMPLETE",
      "percent": 90.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "code": "4ITR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 50,
      "active": true
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "code": "5ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 60,
      "active": true
    },
    {
      "structure": "HPC-BIP-SCAN-SUPPORT",
      "code": "1ENDS_CUT",
      "percent": 10.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-SCAN-SUPPORT",
      "code": "2SCAN",
      "percent": 30.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-SCAN-SUPPORT",
      "code": "3PREP_TACK",
      "percent": 55.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-SCAN-SUPPORT",
      "code": "4WELDING",
      "percent": 90.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "HPC-BIP-SCAN-SUPPORT",
      "code": "5ITR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 50,
      "active": true
    },
    {
      "structure": "HPC-BIP-SCAN-SUPPORT",
      "code": "6ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 60,
      "active": true
    },
    {
      "structure": "HPC-BIP-VALVES",
      "code": "1HAND_POS",
      "percent": 20.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-VALVES",
      "code": "2INSTALL",
      "percent": 90.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-VALVES",
      "code": "3LTR",
      "percent": 95.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-VALVES",
      "code": "4ITR_APPR",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "HPC-BIP-WDI",
      "code": "1WELDING",
      "percent": 25.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "HPC-BIP-WDI",
      "code": "2WELDING",
      "percent": 50.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    },
    {
      "structure": "HPC-BIP-WDI",
      "code": "3WELDING",
      "percent": 75.0,
      "policy": "Fixed",
      "order": 30,
      "active": true
    },
    {
      "structure": "HPC-BIP-WDI",
      "code": "4WELDING",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 40,
      "active": true
    },
    {
      "structure": "DEFAULT",
      "code": "IP",
      "percent": 50.0,
      "policy": "Fixed",
      "order": 10,
      "active": true
    },
    {
      "structure": "DEFAULT",
      "code": "CP",
      "percent": 100.0,
      "policy": "Fixed",
      "order": 20,
      "active": true
    }
  ],
  "pairs": [
    {
      "structure": "HPC-BIP-A222",
      "commodity": "A222",
      "family": "Pipe"
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "commodity": "MECH-SUPPORT",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "commodity": "ELEC-SUPPORT",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "commodity": "HVAC-SUPPORT",
      "family": "HVAC"
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "commodity": "INST-SUPPORT",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-ALL-SUPPORTS",
      "commodity": "NSSS-SUPPORT",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-CABLING",
      "commodity": "ELEC-EARTH",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-CABLING",
      "commodity": "CABLE-EARTHP",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-CABLING",
      "commodity": "CABLE-EARTHS",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-CABLING",
      "commodity": "CABLE-PULL",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-CLAMPS",
      "commodity": "CLAMP",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-CMSS",
      "commodity": "CMSS",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-COATING",
      "commodity": "COATING",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-DUCTING",
      "commodity": "HVAC-DUCT",
      "family": "HVAC"
    },
    {
      "structure": "HPC-BIP-DUCTING",
      "commodity": "HVAC-INLINE",
      "family": "HVAC"
    },
    {
      "structure": "HPC-BIP-ELEC-CONT",
      "commodity": "ELEC-PCON",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-ELEC-SUPPORT",
      "commodity": "ELEC-SUPPORT",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-ELEC-SUPPORT",
      "commodity": "MECH-SUPPORT",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "ELEC-EQUIP",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "ELEC-IED",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "HVAC-INLINE",
      "family": "HVAC"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "HVAC-EQUIP",
      "family": "HVAC"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "HVAC-MP-EQUIP",
      "family": "HVAC"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "INST-EQUIP",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "MECH-EQUIP",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "NSSS-EQUIP",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "VALVE",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "ELEC-CAB-BOXES",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-EQUIPMENT",
      "commodity": "MECH-PIPE",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-IED",
      "commodity": "ELEC-IED",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "commodity": "MECH-PIPE",
      "family": "Pipe"
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "commodity": "PIPE-INST",
      "family": "Pipe"
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "commodity": "NSSS PIPE",
      "family": "Pipe"
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "commodity": "NSSS-PIPE INST",
      "family": "Pipe"
    },
    {
      "structure": "HPC-BIP-PIPEWORK",
      "commodity": "VALVE",
      "family": "Pipe"
    },
    {
      "structure": "HPC-BIP-SCAN-SUPPORT",
      "commodity": "ELEC-SUPPORT",
      "family": "Electrical"
    },
    {
      "structure": "HPC-BIP-SCAN-SUPPORT",
      "commodity": "HVAC-SUPPORT",
      "family": "HVAC"
    },
    {
      "structure": "HPC-BIP-SCAN-SUPPORT",
      "commodity": "MECH-SUPPORT",
      "family": "Mechanical"
    },
    {
      "structure": "HPC-BIP-VALVES",
      "commodity": "VALVE",
      "family": "Pipe"
    },
    {
      "structure": "HPC-BIP-WDI",
      "commodity": "WDI-BNI",
      "family": "Pipe"
    },
    {
      "structure": "HPC-BIP-WDI",
      "commodity": "WDI-BOP",
      "family": "Pipe"
    },
    {
      "structure": "DEFAULT",
      "commodity": "MECH-SUPPORT",
      "family": "Mechanical"
    },
    {
      "structure": "DEFAULT",
      "commodity": "HVAC-DUCT",
      "family": "HVAC"
    }
  ],
  "aliases": {
    "MECHANICAL SUPPORT": "MECH-SUPPORT",
    "MECHANICAL-SUPPORT": "MECH-SUPPORT",
    "MECHANICAL-PIPE": "MECH-PIPE",
    "MECHANICAL PIPE": "MECH-PIPE",
    "HVAC EQUIP": "HVAC-EQUIP",
    "HVAC EQUIPMENT": "HVAC-EQUIP",
    "MECHANICAL-EQUIPMENT": "MECH-EQUIP",
    "HVAC DUCT": "HVAC-DUCT",
    "IN LINE HVAC": "HVAC-INLINE",
    "VALVES": "VALVE",
    "HVAC-MAIN PLANT EQUIPMENT": "HVAC-MP-EQUIP",
    "ELECTRICAL-EARTHING": "ELEC-EARTH",
    "ELECTRICAL SUPPORT": "ELEC-SUPPORT",
    "ELECTRICAL SUPPORTS": "ELEC-SUPPORT",
    "ELECTRICAL-SUPPORT": "ELEC-SUPPORT",
    "ELECTRICAL-SUPPORTS": "ELEC-SUPPORT",
    "ELEC SUPPORT": "ELEC-SUPPORT",
    "ELEC SUPPORTS": "ELEC-SUPPORT",
    "ELEC-SUPPORTS": "ELEC-SUPPORT"
  }
};
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.ProductionGateConfig = data;
})(typeof globalThis !== "undefined" ? globalThis : this);
