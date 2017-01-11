/*global chrome*/
'use strict';

TABS.pid_tuning = {

};

TABS.pid_tuning.initialize = function (callback) {

    var loadChainer = new MSPChainerClass();

    loadChainer.setChain([
        mspHelper.loadStatus,
        mspHelper.loadPidNames,
        mspHelper.loadPidData,
        mspHelper.loadRcTuningData,
        mspHelper.loadINAVPidConfig,
        mspHelper.loadPidAdvanced,
        mspHelper.loadFilterConfig
    ]);
    loadChainer.setExitPoint(load_html);
    loadChainer.execute();

    if (GUI.active_tab != 'pid_tuning') {
        GUI.active_tab = 'pid_tuning';
        googleAnalytics.sendAppView('PID Tuning');
    }

    function load_html() {
        $('#content').load("./tabs/pid_tuning.html", process_html);
    }

    var sectionClasses = [
        'ROLL', // 0
        'PITCH', // 1
        'YAW', // 2
        'ALT', // 3
        'Pos', // 4
        'PosR', // 5
        'NavR', // 6
        'LEVEL', // 7
        'MAG', // 8
        'Vario' // 9
    ];

    function pid_and_rc_to_form() {

        // Fill in the data from PIDs array
        var i;
        /*
         * Iterate over registered sections/PID controllers
         */
        for (var sectionId = 0; sectionId < sectionClasses.length; sectionId++) {

            i = 0;
            /*
             * Now, iterate over inputs inside PID constroller section
             */
            $('.pid_tuning .' + sectionClasses[sectionId] + ' input').each(function () {
                $(this).val(PIDs[sectionId][i]);
                i++;
            });

        }

        // Fill in data from RC_tuning object
        $('.rate-tpa input[name="roll-pitch"]').val(RC_tuning.roll_pitch_rate.toFixed(2));

        if (FC.isRatesInDps()) {
            $('.rate-tpa input[name="roll"]').val(RC_tuning.roll_rate);
            $('.rate-tpa input[name="pitch"]').val(RC_tuning.pitch_rate);
            $('.rate-tpa input[name="yaw"]').val(RC_tuning.yaw_rate);
        } else {
            $('.rate-tpa input[name="roll"]').val(RC_tuning.roll_rate.toFixed(2));
            $('.rate-tpa input[name="pitch"]').val(RC_tuning.pitch_rate.toFixed(2));
            $('.rate-tpa input[name="yaw"]').val(RC_tuning.yaw_rate.toFixed(2));
        }

        $('#tpa').val(RC_tuning.dynamic_THR_PID);
        $('#tpa-breakpoint').val(RC_tuning.dynamic_THR_breakpoint);
    }

    function form_to_pid_and_rc() {

        var i;
        for (var sectionId = 0; sectionId < sectionClasses.length; sectionId++) {
          i = 0;
          $('table.pid_tuning tr.' + sectionClasses[sectionId] + ' input').each(function () {
              PIDs[sectionId][i] = parseFloat($(this).val());
              i++;
          });
        }

        // catch RC_tuning changes
        RC_tuning.roll_pitch_rate = parseFloat($('.rate-tpa input[name="roll-pitch"]').val());
        RC_tuning.roll_rate = parseFloat($('.rate-tpa input[name="roll"]:visible').val());
        RC_tuning.pitch_rate = parseFloat($('.rate-tpa input[name="pitch"]:visible').val());
        RC_tuning.yaw_rate = parseFloat($('.rate-tpa input[name="yaw"]:visible').val());
        RC_tuning.dynamic_THR_PID = parseInt($('#tpa').val());
        RC_tuning.dynamic_THR_breakpoint = parseInt($('#tpa-breakpoint').val());
    }
    function hideUnusedPids(sensors_detected) {
      $('.tab-pid_tuning table.pid_tuning').hide();
      $('#pid_main').show();

      if (have_sensor(sensors_detected, 'acc')) {
        $('#pid_accel').show();
      }
      if (have_sensor(sensors_detected, 'baro')) {
        $('#pid_baro').show();
      }
      if (have_sensor(sensors_detected, 'mag')) {
        $('#pid_mag').show();
      }
      if (bit_check(BF_CONFIG.features, 7)) {   //This will need to be reworked to remove BF_CONFIG reference eventually
        $('#pid_gps').show();
      }
      if (have_sensor(sensors_detected, 'sonar')) {
        $('#pid_baro').show();
      }
    }
    function process_html() {
        // translate to user-selected language
        localize();

        hideUnusedPids(CONFIG.activeSensors);

        $('#showAllPids').on('click', function(){
          if($(this).text() == "Show all PIDs") {
            $('.tab-pid_tuning table.pid_tuning').show();
            $(this).text('Hide unused PIDs');
          } else {
            hideUnusedPids(CONFIG.activeSensors);
            $(this).text('Show all PIDs');
          }
        });

        $('#resetPIDs').on('click', function(){
            MSP.send_message(MSPCodes.MSP_SET_RESET_CURR_PID, false, false, false);
	        updateActivatedTab();
        });

        var i;

        $('.pid_tuning tr').each(function(){
          for(i = 0; i < PID_names.length; i++) {
            if($(this).hasClass(PID_names[i])) {
              $(this).find('td:first').text(PID_names[i]);
            }
          }
        });

        pid_and_rc_to_form();

        if (FC.isRatesInDps()) {
           $('.rate-tpa--no-dps').hide();
        } else {
            $('.rate-tpa .roll-pitch').hide();
            $('.rate-tpa--inav').hide();
        }

        if (semver.gte(CONFIG.flightControllerVersion, "1.4.0")) {
            var $magHoldYawRate                 = $("#magHoldYawRate"),
                $yawJumpPreventionLimit         = $('#yawJumpPreventionLimit'),
                $yawPLimit                      = $('#yawPLimit'),
                $gyroSoftLpfHz                  = $('#gyroSoftLpfHz'),
                $accSoftLpfHz                   = $('#accSoftLpfHz'),
                $dtermLpfHz                     = $('#dtermLpfHz'),
                $yawLpfHz                       = $('#yawLpfHz'),
                $rollPitchItermIgnoreRate       = $('#rollPitchItermIgnoreRate'),
                $yawItermIgnoreRate             = $('#yawItermIgnoreRate'),
                $axisAccelerationLimitRollPitch = $('#axisAccelerationLimitRollPitch'),
                $axisAccelerationLimitYaw       = $('#axisAccelerationLimitYaw');

            $magHoldYawRate.val(INAV_PID_CONFIG.magHoldRateLimit);
            $yawJumpPreventionLimit.val(INAV_PID_CONFIG.yawJumpPreventionLimit);
            $yawPLimit.val(PID_ADVANCED.yawPLimit);
            $gyroSoftLpfHz.val(FILTER_CONFIG.gyroSoftLpfHz);
            $accSoftLpfHz.val(INAV_PID_CONFIG.accSoftLpfHz);
            $dtermLpfHz.val(FILTER_CONFIG.dtermLpfHz);
            $yawLpfHz.val(FILTER_CONFIG.yawLpfHz),
            $rollPitchItermIgnoreRate.val(PID_ADVANCED.rollPitchItermIgnoreRate);
            $yawItermIgnoreRate.val(PID_ADVANCED.yawItermIgnoreRate);
            $axisAccelerationLimitRollPitch.val(PID_ADVANCED.axisAccelerationLimitRollPitch * 10);
            $axisAccelerationLimitYaw.val(PID_ADVANCED.axisAccelerationLimitYaw * 10)

            $magHoldYawRate.change(function () {
                INAV_PID_CONFIG.magHoldRateLimit = parseInt($magHoldYawRate.val(), 10);
            });

            $yawJumpPreventionLimit.change(function () {
                INAV_PID_CONFIG.yawJumpPreventionLimit = parseInt($yawJumpPreventionLimit.val(), 10);
            });

            $yawPLimit.change(function () {
                PID_ADVANCED.yawPLimit = parseInt($yawPLimit.val(), 10);
            });

            $gyroSoftLpfHz.change(function () {
                FILTER_CONFIG.gyroSoftLpfHz = parseInt($gyroSoftLpfHz.val(), 10);
            });

            $accSoftLpfHz.change(function () {
                INAV_PID_CONFIG.accSoftLpfHz = parseInt($accSoftLpfHz.val(), 10);
            });

            $dtermLpfHz.change(function () {
                FILTER_CONFIG.dtermLpfHz = parseInt($dtermLpfHz.val(), 10);
            });

            $yawLpfHz.change(function () {
                FILTER_CONFIG.yawLpfHz = parseInt($yawLpfHz.val(), 10);
            });

            $rollPitchItermIgnoreRate.change(function () {
                PID_ADVANCED.rollPitchItermIgnoreRate = parseInt($rollPitchItermIgnoreRate.val(), 10);
            });

            $yawItermIgnoreRate.change(function () {
                PID_ADVANCED.yawItermIgnoreRate = parseInt($yawItermIgnoreRate.val(), 10);
            });

            $axisAccelerationLimitRollPitch.change(function () {
                PID_ADVANCED.axisAccelerationLimitRollPitch = Math.round(parseInt($axisAccelerationLimitRollPitch.val(), 10) / 10);
            });

            $axisAccelerationLimitYaw.change(function () {
                PID_ADVANCED.axisAccelerationLimitYaw = Math.round(parseInt($axisAccelerationLimitYaw.val(), 10) / 10);
            });

            $('.requires-v1_4').show();
        } else {
            $('.requires-v1_4').hide();
        }
        // UI Hooks

        $('a.refresh').click(function () {
            GUI.tab_switch_cleanup(function () {
                GUI.log(chrome.i18n.getMessage('pidTuningDataRefreshed'));
                TABS.pid_tuning.initialize();
            });
        });

        // update == save.
        $('a.update').click(function () {
            form_to_pid_and_rc();

            function send_pids() {
                MSP.send_message(MSPCodes.MSP_SET_PID, mspHelper.crunch(MSPCodes.MSP_SET_PID), false, send_rc_tuning_changes);
            }

            function send_rc_tuning_changes() {
                MSP.send_message(MSPCodes.MSP_SET_RC_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_RC_TUNING), false, saveINAVPidConfig);
            }

            function saveINAVPidConfig() {
                var next_callback = savePidAdvanced;
                if(semver.gte(CONFIG.flightControllerVersion, "1.4.0")) {
                   MSP.send_message(MSPCodes.MSP_SET_INAV_PID, mspHelper.crunch(MSPCodes.MSP_SET_INAV_PID), false, next_callback);
                } else {
                   next_callback();
                }
            }

            function savePidAdvanced() {
                var next_callback = saveFilterConfig;
                if(semver.gte(CONFIG.flightControllerVersion, "1.4.0")) {
                   MSP.send_message(MSPCodes.MSP_SET_PID_ADVANCED, mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED), false, next_callback);
                } else {
                   next_callback();
                }
            }

            function saveFilterConfig() {
                var next_callback = save_to_eeprom;
                if(semver.gte(CONFIG.flightControllerVersion, "1.4.0")) {
                   MSP.send_message(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG), false, next_callback);
                } else {
                   next_callback();
                }
            }

            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                    GUI.log(chrome.i18n.getMessage('pidTuningEepromSaved'));
                });
            }

            send_pids();
        });

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }
};

TABS.pid_tuning.cleanup = function (callback) {
    if (callback) {
        callback();
    }
};
