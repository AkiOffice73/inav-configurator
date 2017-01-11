/*global chrome, chrome.i18n*/
'use strict';

$(document).ready(function () {

    var $port = $('#port'),
        $baud = $('#baud'),
        $portOverride = $('#port-override');

    GUI.handleReconnect = function ($tabElement) {
        if (BOARD.find_board_definition(CONFIG.boardIdentifier).vcp) { // VCP-based flight controls may crash old drivers, we catch and reconnect

            /*
             Disconnect
             */
            setTimeout(function () {
                $('a.connect').click();
            }, 100);

            /*
             Connect again
             */
            setTimeout(function start_connection() {
                $('a.connect').click();

                /*
                 Open configuration tab
                 */
                if ($tabElement != null) {
                    setTimeout(function () {
                        $tabElement.click();
                    }, 500);
                }

            }, 5000);
        } else {

            GUI.timeout_add('waiting_for_bootup', function waiting_for_bootup() {
                MSP.send_message(MSPCodes.MSP_IDENT, false, false, function () {
                    //noinspection JSUnresolvedVariable
                    GUI.log(chrome.i18n.getMessage('deviceReady'));
                    //noinspection JSValidateTypes
                    TABS.configuration.initialize(false, $('#content').scrollTop());
                });
            },1500); // 1500 ms seems to be just the right amount of delay to prevent data request timeouts
        }
    };

    GUI.updateManualPortVisibility = function(){
        var selected_port = $port.find('option:selected');
        if (selected_port.data().isManual) {
            $('#port-override-option').show();
        }
        else {
            $('#port-override-option').hide();
        }
        if (selected_port.data().isDFU) {
            $baud.hide();
        }
        else {
            $baud.show();
        }
    };

    GUI.updateManualPortVisibility();

    $portOverride.change(function () {
        chrome.storage.local.set({'portOverride': $portOverride.val()});
    });

    chrome.storage.local.get('portOverride', function (data) {
        $portOverride.val(data.portOverride);
    });

    $port.change(function (target) {
        GUI.updateManualPortVisibility();
    });

    $('div.connect_controls a.connect').click(function () {
        if (GUI.connect_lock != true) { // GUI control overrides the user control

            var clicks = $(this).data('clicks');
            var selected_baud = parseInt($baud.val());
            var selected_port = $port.find('option:selected').data().isManual ?
                    $portOverride.val() :
                    String($port.val());
            if (selected_port === 'DFU') {
                GUI.log(chrome.i18n.getMessage('dfu_connect_message'));
            }
            else if (selected_port != '0') {
                if (!clicks) {
                    console.log('Connecting to: ' + selected_port);
                    GUI.connecting_to = selected_port;

                    // lock port select & baud while we are connecting / connected
                    $('#port, #baud, #delay').prop('disabled', true);
                    $('div.connect_controls a.connect_state').text(chrome.i18n.getMessage('connecting'));

                    serial.connect(selected_port, {bitrate: selected_baud}, onOpen);
                } else {
                    GUI.timeout_kill_all();
                    GUI.interval_kill_all();
                    GUI.tab_switch_cleanup();
                    GUI.tab_switch_in_progress = false;

                    serial.disconnect(onClosed);

                    var wasConnected = CONFIGURATOR.connectionValid;

                    GUI.connected_to = false;
                    CONFIGURATOR.connectionValid = false;
                    GUI.allowedTabs = GUI.defaultAllowedTabsWhenDisconnected.slice();
                    MSP.disconnect_cleanup();
                    PortUsage.reset();

                    // Reset various UI elements
                    $('span.i2c-error').text(0);
                    $('span.cycle-time').text(0);
                    $('span.cpu-load').text('');

                    // unlock port select & baud
                    $port.prop('disabled', false);
                    if (!GUI.auto_connect) {
                        $baud.prop('disabled', false);
                    }

                    // reset connect / disconnect button
                    $('div.connect_controls a.connect').removeClass('active');
                    $('div.connect_controls a.connect_state').text(chrome.i18n.getMessage('connect'));

                    // reset active sensor indicators
                    sensor_status(0);

                    if (wasConnected) {
                        // detach listeners and remove element data
                        $('#content').empty();
                    }

                    $('#tabs .tab_landing a').click();
                }

                $(this).data("clicks", !clicks);
            }
        }
    });

    // auto-connect
    chrome.storage.local.get('auto_connect', function (result) {
        if (result.auto_connect === 'undefined' || result.auto_connect) {
            // default or enabled by user
            GUI.auto_connect = true;

            $('input.auto_connect').prop('checked', true);
            $('input.auto_connect, span.auto_connect').prop('title', chrome.i18n.getMessage('autoConnectEnabled'));

            $baud.val(115200).prop('disabled', true);
        } else {
            // disabled by user
            GUI.auto_connect = false;

            $('input.auto_connect').prop('checked', false);
            $('input.auto_connect, span.auto_connect').prop('title', chrome.i18n.getMessage('autoConnectDisabled'));
        }

        // bind UI hook to auto-connect checkbos
        $('input.auto_connect').change(function () {
            GUI.auto_connect = $(this).is(':checked');

            // update title/tooltip
            if (GUI.auto_connect) {
                $('input.auto_connect, span.auto_connect').prop('title', chrome.i18n.getMessage('autoConnectEnabled'));

                $baud.val(115200).prop('disabled', true);
            } else {
                $('input.auto_connect, span.auto_connect').prop('title', chrome.i18n.getMessage('autoConnectDisabled'));

                if (!GUI.connected_to && !GUI.connecting_to) $('select#baud').prop('disabled', false);
            }

            chrome.storage.local.set({'auto_connect': GUI.auto_connect});


        });
    });

    PortHandler.initialize();
    PortUsage.initialize();
});

function onOpen(openInfo) {
    if (openInfo) {
        // update connected_to
        GUI.connected_to = GUI.connecting_to;

        // reset connecting_to
        GUI.connecting_to = false;

        GUI.log(chrome.i18n.getMessage('serialPortOpened', [openInfo.connectionId]));

        // save selected port with chrome.storage if the port differs
        chrome.storage.local.get('last_used_port', function (result) {
            if (result.last_used_port) {
                if (result.last_used_port != GUI.connected_to) {
                    // last used port doesn't match the one found in local db, we will store the new one
                    chrome.storage.local.set({'last_used_port': GUI.connected_to});
                }
            } else {
                // variable isn't stored yet, saving
                chrome.storage.local.set({'last_used_port': GUI.connected_to});
            }
        });

        serial.onReceive.addListener(read_serial);

        // disconnect after 10 seconds with error if we don't get IDENT data
        GUI.timeout_add('connecting', function () {
            if (!CONFIGURATOR.connectionValid) {
                GUI.log(chrome.i18n.getMessage('noConfigurationReceived'));

                $('div.connect_controls ').click(); // disconnect
            }
        }, 10000);

        FC.resetState();

        // request configuration data
        MSP.send_message(MSPCodes.MSP_API_VERSION, false, false, function () {
            GUI.log(chrome.i18n.getMessage('apiVersionReceived', [CONFIG.apiVersion]));

            if (semver.gte(CONFIG.apiVersion, CONFIGURATOR.apiVersionAccepted)) {

                MSP.send_message(MSPCodes.MSP_FC_VARIANT, false, false, function () {

                    MSP.send_message(MSPCodes.MSP_FC_VERSION, false, false, function () {

                        googleAnalytics.sendEvent('Firmware', 'Variant', CONFIG.flightControllerIdentifier + ',' + CONFIG.flightControllerVersion);
                        GUI.log(chrome.i18n.getMessage('fcInfoReceived', [CONFIG.flightControllerIdentifier, CONFIG.flightControllerVersion]));

                        if (CONFIG.flightControllerIdentifier == 'INAV') {

                            MSP.send_message(MSPCodes.MSP_BUILD_INFO, false, false, function () {

                                googleAnalytics.sendEvent('Firmware', 'Using', CONFIG.buildInfo);
                                GUI.log(chrome.i18n.getMessage('buildInfoReceived', [CONFIG.buildInfo]));

                                MSP.send_message(MSPCodes.MSP_BOARD_INFO, false, false, function () {

                                    googleAnalytics.sendEvent('Board', 'Using', CONFIG.boardIdentifier + ',' + CONFIG.boardVersion);
                                    GUI.log(chrome.i18n.getMessage('boardInfoReceived', [CONFIG.boardIdentifier, CONFIG.boardVersion]));

                                    MSP.send_message(MSPCodes.MSP_UID, false, false, function () {
                                        GUI.log(chrome.i18n.getMessage('uniqueDeviceIdReceived', [CONFIG.uid[0].toString(16) + CONFIG.uid[1].toString(16) + CONFIG.uid[2].toString(16)]));

                                        // continue as usually
                                        CONFIGURATOR.connectionValid = true;
                                        GUI.allowedTabs = GUI.defaultAllowedTabsWhenConnected.slice();
                                        //TODO here we can remove led_strip tab from NAZE and CC3D at least!

                                        if (semver.lt(CONFIG.flightControllerVersion, "1.5.0")) {
                                            GUI.allowedTabs.splice(GUI.allowedTabs.indexOf('osd'), 1);
                                        }

                                        /*
                                         * Remove Presets on older than 1.6
                                         */
                                        if (semver.lt(CONFIG.flightControllerVersion, "1.6.0")) {
                                            GUI.allowedTabs.splice(GUI.allowedTabs.indexOf('profiles'), 1);
                                        }

                                        onConnect();

                                        $('#tabs ul.mode-connected .tab_setup a').click();
                                    });
                                });
                            });
                        } else  {
                            GUI.log(chrome.i18n.getMessage('firmwareVariantNotSupported'));
                            CONFIGURATOR.connectionValid = true; // making it possible to open the CLI tab
                            GUI.allowedTabs = ['cli'];
                            onConnect();
                            $('#tabs .tab_cli a').click();
                        }
                    });
                });
            } else {
                GUI.log(chrome.i18n.getMessage('firmwareVersionNotSupported', [CONFIGURATOR.apiVersionAccepted]));
                CONFIGURATOR.connectionValid = true; // making it possible to open the CLI tab
                GUI.allowedTabs = ['cli'];
                onConnect();
                $('#tabs .tab_cli a').click();
            }
        });
    } else {
        console.log('Failed to open serial port');
        GUI.log(chrome.i18n.getMessage('serialPortOpenFail'));

        $('div#connectbutton a.connect_state').text(chrome.i18n.getMessage('connect'));
        $('div#connectbutton a.connect').removeClass('active');

        // unlock port select & baud
        $('#port, #baud, #delay').prop('disabled', false);

        // reset data
        $('div#connectbutton a.connect').data("clicks", false);
    }
}

function onConnect() {
    GUI.timeout_remove('connecting'); // kill connecting timer
    $('div#connectbutton a.connect_state').text(chrome.i18n.getMessage('disconnect')).addClass('active');
    $('div#connectbutton a.connect').addClass('active');
    $('#tabs ul.mode-disconnected').hide();
    $('#tabs ul.mode-connected').show();

    if (semver.gte(CONFIG.flightControllerVersion, "1.2.0")) {
        MSP.send_message(MSPCodes.MSP_STATUS_EX, false, false);
    } else {
        MSP.send_message(MSPCodes.MSP_STATUS, false, false);
    }

    MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false);

    $('#sensor-status').show();
    $('#portsinput').hide();
    $('#dataflash_wrapper_global').show();

    startLiveDataRefreshTimer();
}

function onClosed(result) {
    if (result) { // All went as expected
        GUI.log(chrome.i18n.getMessage('serialPortClosedOk'));
    } else { // Something went wrong
        GUI.log(chrome.i18n.getMessage('serialPortClosedFail'));
    }

    $('#tabs ul.mode-connected').hide();
    $('#tabs ul.mode-disconnected').show();

    $('#sensor-status').hide();
    $('#portsinput').show();
    $('#dataflash_wrapper_global').hide();
    $('#quad-status_wrapper').hide();
}

function read_serial(info) {
    if (!CONFIGURATOR.cliActive) {
        MSP.read(info);
    } else if (CONFIGURATOR.cliActive) {
        TABS.cli.read(info);
    }
}

/**
 * Sensor handler used in INAV >= 1.5
 * @param hw_status
 */
function sensor_status_ex(hw_status)
{
    var statusHash = sensor_status_hash(hw_status);

    if (sensor_status_ex.previousHash == statusHash) {
        return;
    }

    sensor_status_ex.previousHash = statusHash;

    sensor_status_update_icon('.gyro',      '.gyroicon',        hw_status.gyroHwStatus);
    sensor_status_update_icon('.accel',     '.accicon',         hw_status.accHwStatus);
    sensor_status_update_icon('.mag',       '.magicon',         hw_status.magHwStatus);
    sensor_status_update_icon('.baro',      '.baroicon',        hw_status.baroHwStatus);
    sensor_status_update_icon('.gps',       '.gpsicon',         hw_status.gpsHwStatus);
    sensor_status_update_icon('.sonar',     '.sonaricon',       hw_status.rangeHwStatus);
    sensor_status_update_icon('.airspeed',  '.airspeedicon',    hw_status.speedHwStatus);
    sensor_status_update_icon('.opflow',    '.opflowicon',      hw_status.flowHwStatus);
}

function sensor_status_update_icon(sensId, sensIconId, status)
{
    var e_sensor_status = $('#sensor-status');

    if (status == 0) {
        $(sensId, e_sensor_status).removeClass('on');
        $(sensIconId, e_sensor_status).removeClass('active');
        $(sensIconId, e_sensor_status).removeClass('error');
    }
    else if (status == 1) {
        $(sensId, e_sensor_status).addClass('on');
        $(sensIconId, e_sensor_status).addClass('active');
        $(sensIconId, e_sensor_status).removeClass('error');
    }
    else {
        $(sensId, e_sensor_status).removeClass('on');
        $(sensIconId, e_sensor_status).removeClass('active');
        $(sensIconId, e_sensor_status).addClass('error');
    }
}

function sensor_status_hash(hw_status)
{
    return "S" +
           hw_status.isHardwareHealthy +
           hw_status.gyroHwStatus +
           hw_status.accHwStatus +
           hw_status.magHwStatus +
           hw_status.baroHwStatus +
           hw_status.gpsHwStatus +
           hw_status.rangeHwStatus +
           hw_status.speedHwStatus +
           hw_status.flowHwStatus;
}

/**
 * Legacy sensor handler used in INAV < 1.5 versions
 * @param sensors_detected
 * @deprecated
 */
function sensor_status(sensors_detected) {
    SENSOR_STATUS.isHardwareHealthy = 1;
    SENSOR_STATUS.gyroHwStatus      = have_sensor(sensors_detected, 'gyro') ? 1 : 0;
    SENSOR_STATUS.accHwStatus       = have_sensor(sensors_detected, 'acc') ? 1 : 0;
    SENSOR_STATUS.magHwStatus       = have_sensor(sensors_detected, 'mag') ? 1 : 0;
    SENSOR_STATUS.baroHwStatus      = have_sensor(sensors_detected, 'baro') ? 1 : 0;
    SENSOR_STATUS.gpsHwStatus       = have_sensor(sensors_detected, 'gps') ? 1 : 0;
    SENSOR_STATUS.rangeHwStatus     = have_sensor(sensors_detected, 'sonar') ? 1 : 0;
    SENSOR_STATUS.speedHwStatus     = have_sensor(sensors_detected, 'airspeed') ? 1 : 0;
    SENSOR_STATUS.flowHwStatus      = have_sensor(sensors_detected, 'opflow') ? 1 : 0;
    sensor_status_ex(SENSOR_STATUS);
}

function have_sensor(sensors_detected, sensor_code) {
    switch(sensor_code) {
        case 'acc':
        case 'gyro':
            return bit_check(sensors_detected, 0);
        case 'baro':
            return bit_check(sensors_detected, 1);
        case 'mag':
            return bit_check(sensors_detected, 2);
        case 'gps':
            return bit_check(sensors_detected, 3);
        case 'sonar':
            return bit_check(sensors_detected, 4);
        case 'opflow':
            return bit_check(sensors_detected, 5);
        case 'airspeed':
            return bit_check(sensors_detected, 6);
    }
    return false;
}

function highByte(num) {
    return num >> 8;
}

function lowByte(num) {
    return 0x00FF & num;
}

function update_dataflash_global() {
        var supportsDataflash = DATAFLASH.totalSize > 0;
        if (supportsDataflash){

             $(".noflash_global").css({
                 display: 'none'
             });

             $(".dataflash-contents_global").css({
                 display: 'block'
             });

             $(".dataflash-free_global").css({
                 width: (100-(DATAFLASH.totalSize - DATAFLASH.usedSize) / DATAFLASH.totalSize * 100) + "%",
                 display: 'block'
             });
             $(".dataflash-free_global div").text('Dataflash: free ' + formatFilesize(DATAFLASH.totalSize - DATAFLASH.usedSize));
        } else {
             $(".noflash_global").css({
                 display: 'block'
             });

             $(".dataflash-contents_global").css({
                 display: 'none'
             });
        }

    }

function startLiveDataRefreshTimer() {
    // live data refresh
    GUI.timeout_add('data_refresh', function () { update_live_status(); }, 100);
}

function update_live_status() {

    var statuswrapper = $('#quad-status_wrapper');

    $(".quad-status-contents").css({
       display: 'inline-block'
    });

    if (GUI.active_tab != 'cli') {
        MSP.send_message(MSPCodes.MSP_BOXNAMES, false, false);
        if (semver.gte(CONFIG.flightControllerVersion, "1.2.0"))
        	MSP.send_message(MSPCodes.MSP_STATUS_EX, false, false);
        else
        	MSP.send_message(MSPCodes.MSP_STATUS, false, false);
        MSP.send_message(MSPCodes.MSP_ANALOG, false, false);
    }

    var active = ((Date.now() - MSP.analog_last_received_timestamp) < 300);

    for (var i = 0; i < AUX_CONFIG.length; i++) {
       if (AUX_CONFIG[i] == 'ARM') {
               if (bit_check(CONFIG.mode, i))
                       $(".armedicon").css({
                               'background-image': 'url(images/icons/cf_icon_armed_active.svg)'
                           });
               else
                       $(".armedicon").css({
                               'background-image': 'url(images/icons/cf_icon_armed_grey.svg)'
                           });
       }
       if (AUX_CONFIG[i] == 'FAILSAFE') {
               if (bit_check(CONFIG.mode, i))
                       $(".failsafeicon").css({
                               'background-image': 'url(images/icons/cf_icon_failsafe_active.svg)'
                           });
               else
                       $(".failsafeicon").css({
                               'background-image': 'url(images/icons/cf_icon_failsafe_grey.svg)'
                           });
       }
    }
    if (ANALOG != undefined) {
    var nbCells = Math.floor(ANALOG.voltage / MISC.vbatmaxcellvoltage) + 1;
    if (ANALOG.voltage == 0)
           nbCells = 1;

       var min = MISC.vbatmincellvoltage * nbCells;
       var max = MISC.vbatmaxcellvoltage * nbCells;
       var warn = MISC.vbatwarningcellvoltage * nbCells;

       $(".battery-status").css({
          width: ((ANALOG.voltage - min) / (max - min) * 100) + "%",
          display: 'inline-block'
       });

       if (active) {
           $(".linkicon").css({
               'background-image': 'url(images/icons/cf_icon_link_active.svg)'
           });
       } else {
           $(".linkicon").css({
               'background-image': 'url(images/icons/cf_icon_link_grey.svg)'
           });
       }

       if (ANALOG.voltage < warn) {
           $(".battery-status").css('background-color', '#D42133');
       } else  {
           $(".battery-status").css('background-color', '#59AA29');
       }

       $(".battery-legend").text(ANALOG.voltage + " V");
    }

    statuswrapper.show();
    GUI.timeout_remove('data_refresh');
    startLiveDataRefreshTimer();
}

function specificByte(num, pos) {
    return 0x000000FF & (num >> (8 * pos));
}

function bit_check(num, bit) {
    return ((num >> bit) % 2 != 0);
}

function bit_set(num, bit) {
    return num | 1 << bit;
}

function bit_clear(num, bit) {
    return num & ~(1 << bit);
}

function update_dataflash_global() {
    function formatFilesize(bytes) {
        if (bytes < 1024) {
            return bytes + "B";
        }
        var kilobytes = bytes / 1024;

        if (kilobytes < 1024) {
            return Math.round(kilobytes) + "kB";
        }

        var megabytes = kilobytes / 1024;

        return megabytes.toFixed(1) + "MB";
    }

    var supportsDataflash = DATAFLASH.totalSize > 0;

    if (supportsDataflash){
        $(".noflash_global").css({
           display: 'none'
        });

        $(".dataflash-contents_global").css({
           display: 'block'
        });

        $(".dataflash-free_global").css({
           width: (100-(DATAFLASH.totalSize - DATAFLASH.usedSize) / DATAFLASH.totalSize * 100) + "%",
           display: 'block'
        });
        $(".dataflash-free_global div").text('Dataflash: free ' + formatFilesize(DATAFLASH.totalSize - DATAFLASH.usedSize));
     } else {
        $(".noflash_global").css({
           display: 'block'
        });

        $(".dataflash-contents_global").css({
           display: 'none'
        });
     }
}
