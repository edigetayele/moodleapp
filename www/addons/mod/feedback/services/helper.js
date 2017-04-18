// (C) Copyright 2015 Martin Dougiamas
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

angular.module('mm.addons.mod_feedback')

/**
 * Helper to gather some common functions for feedback.
 *
 * @module mm.addons.mod_feedback
 * @ngdoc service
 * @name $mmaModFeedbackHelper
 */
.factory('$mmaModFeedbackHelper', function($ionicHistory, $mmGroups, $translate, $mmSite, $mmUtil, $state, $mmText, $mmUser, $q,
        $mmaModFeedback) {

    var self = {},
        MODE_RESPONSETIME = 1,
        MODE_COURSE = 2,
        MODE_CATEGORY = 3,
        FEEDBACK_LINE_SEP = '|',
        FEEDBACK_MULTICHOICE_TYPE_SEP = '>>>>>',
        FEEDBACK_MULTICHOICE_ADJUST_SEP = '<<<<<',
        FEEDBACK_MULTICHOICE_HIDENOSELECT = 'h',
        FEEDBACK_MULTICHOICERATED_VALUE_SEP = '####';

    /**
     * Get activity feedback group info to be shown on templates.
     *
     * @module mm.addons.mod_feedback
     * @ngdoc method
     * @name $mmaModFeedbackHelper#getFeedbackGroupInfo
     * @param  {Number} cmId        Course Module Id of the feedback.
     * @return {Object}             Containing the group info related to the activity.
     */
    self.getFeedbackGroupInfo = function(cmId) {
        var groupInfo = {};

        return $mmGroups.getActivityGroupMode(cmId).then(function(groupMode) {
            if (groupMode === $mmGroups.SEPARATEGROUPS || groupMode === $mmGroups.VISIBLEGROUPS) {
                groupInfo.separateGroups = groupMode === $mmGroups.SEPARATEGROUPS;
                groupInfo.visibleGroups = groupMode === $mmGroups.VISIBLEGROUPS;
                return $mmGroups.getActivityAllowedGroups(cmId);
            }
            return [];
        }).then(function (groups) {
            if (groups.length <= 0) {
                groupInfo.separateGroups = false;
                groupInfo.visibleGroups = false;
            } else {
                groupInfo.groups = [
                    {'id': 0, 'name': $translate.instant('mm.core.allparticipants')}
                ];
                groupInfo.groups = groupInfo.groups.concat(groups);
            }
            return groupInfo;
        });
    };

    /**
     * Helper function to open a feature in the app.
     *
     * @module mm.addons.mod_feedback
     * @ngdoc method
     * @name $mmaModFeedbackHelper#openFeature
     * @param {String}  feature          Name of the feature to open.
     * @param {Object}  module           Course module activity object.
     * @param {Number}  courseId         Course Id.
     */
    self.openFeature = function(feature, module, courseId) {
        var pageName = feature ? 'site.mod_feedback-' + feature : 'site.mod_feedback',
            backTimes = getHistoryBackCounter(pageName, module.instance);

        if (backTimes < 0) {
            // Go back X times until the the page we want to reach.
            $ionicHistory.goBack(backTimes);
        } else {
            // Not found, open new state.
            var stateParams = {
                module: module,
                moduleid: module.id,
                courseid: courseId,
                feedbackid: module.instance
            };
            $state.go(pageName, stateParams);
        }

        // Check if the page we are going to open is in the history and returns the number of states to go back.
        function getHistoryBackCounter(pageName, feedbackId) {
            var view, historyInstance, backTimes = 0,
                backViewId = $ionicHistory.currentView().backViewId;

            while (backViewId) {
                view = $ionicHistory.viewHistory().views[backViewId];

                if (!view.stateName.startsWith('site.mod_feedback')) {
                    break;
                }

                historyInstance = view.stateParams.feedbackid ? view.stateParams.feedbackid : view.stateParams.module.instance;

                // Check we are not changing to another feedback.
                if (historyInstance && historyInstance == feedbackId) {
                    backTimes--;
                } else {
                    break;
                }

                backViewId = view.backViewId;

                // Page found.
                if (view.stateName == pageName) {
                    return backTimes;
                }
            }

            return 0;
        }
    };

    /**
     * Process and returns item to print form.
     *
     * @module mm.addons.mod_feedback
     * @ngdoc method
     * @name $mmaModFeedbackHelper#getItemForm
     * @param {Object}  item           Item to process
     * @param {Boolean} preview        Previewing options.
     * @return {Object}       Item processed to show form.
     */
    self.getItemForm = function(item, preview) {
        switch (item.typ) {
            case 'label':
                return getItemFormLabel(item);
            case 'info':
                return getItemFormInfo(item);
            case 'numeric':
                return getItemFormNumeric(item);
            case 'textfield':
                return getItemFormTextfield(item);
            case 'textarea':
                return getItemFormTextarea(item);
            case 'multichoice':
                return getItemFormMultichoice(item);
            case 'multichoicerated':
                return getItemFormMultichoice(item);
            case 'pagebreak':
                if (!preview) {
                    // Pagebreaks are only used on preview.
                    return false;
                }
                break;
            case 'captcha':
                // Captcha is not supported right now. However label will be shown.
                return getItemFormCaptcha(item);
            default:
                return false;
        }
        return item;

        // Helper functions by type:
        function getItemFormLabel(item) {
            item.template = 'label';
            item.name = "";
            item.presentation = $mmText.replacePluginfileUrls(item.presentation, item.itemfiles);
            return item;
        }

        function getItemFormInfo(item) {
            item.template = 'label';

            var type = parseInt(item.presentation, 10);

            if (type == MODE_COURSE || type == MODE_CATEGORY) {
                item.presentation = item.otherdata;
                item.value = typeof item.rawValue != "undefined" ? item.rawValue : item.otherdata;
            } else if (type == MODE_RESPONSETIME) {
                item.value = '__CURRENT__TIMESTAMP__';
                var tempValue = typeof item.rawValue != "undefined" ? item.rawValue * 1000 : new Date().getTime();
                item.presentation = moment(tempValue).format($translate.instant('mm.core.dffulldate'));
            } else {
                // Errors on item, return false.
                return false;
            }

            return item;
        }

        function getItemFormNumeric(item) {
            item.template = 'numeric';

            var range = item.presentation.split(FEEDBACK_LINE_SEP) || [];
            item.rangefrom = range.length > 0 ? parseInt(range[0], 10) || '' : '';
            item.rangeto = range.length > 1 ? parseInt(range[1], 10) || '' : '';
            item.value = typeof item.rawValue != "undefined" ? item.rawValue : "";

            return item;
        }

        function getItemFormTextfield(item) {
            item.template = 'textfield';
            item.length = item.presentation.split(FEEDBACK_LINE_SEP)[1] || 255;
            item.value = typeof item.rawValue != "undefined" ? item.rawValue : "";
            return item;
        }

        function getItemFormTextarea(item) {
            item.template = 'textarea';
            item.value = typeof item.rawValue != "undefined" ? item.rawValue : "";
            return item;
        }

        function getItemFormMultichoice(item) {
            var parts = item.presentation.split(FEEDBACK_MULTICHOICE_TYPE_SEP) || [];
            item.subtype = parts.length > 0 && parts[0] ? parts[0] : 'r';
            item.template = 'multichoice-' + item.subtype;

            item.presentation = parts.length > 1 ? parts[1] : '';
            if (item.subtype != 'd') {
                parts = item.presentation.split(FEEDBACK_MULTICHOICE_ADJUST_SEP) || [];
                item.presentation = parts.length > 0 ? parts[0] : '';
                // Horizontal are not supported right now.
                //item.horizontal = parts.length > 1 && !!parts[1];
            } else {
                item.class = "item-select";
            }

            item.choices = item.presentation.split(FEEDBACK_LINE_SEP) || [];
            item.choices = item.choices.map(function(choice, index) {
                var weightValue = choice.split(FEEDBACK_MULTICHOICERATED_VALUE_SEP) || [''];
                choice = weightValue.length == 1 ? weightValue[0] : '(' + weightValue[0] + ') ' + weightValue[1];
                return {value: index + 1, label: choice};
            });

            if (item.subtype === 'r' && item.options.search(FEEDBACK_MULTICHOICE_HIDENOSELECT) == -1) {
                item.choices.unshift({value: 0, label: $translate.instant('mma.mod_feedback.not_selected')});
                item.value = typeof item.rawValue != "undefined" ? parseInt(item.rawValue, 10) : 0;
            } else if (item.subtype === 'd') {
                item.choices.unshift({value: 0, label: ''});
                item.value = typeof item.rawValue != "undefined" ? parseInt(item.rawValue, 10) : 0;
            } else if (item.subtype === 'c') {
                if (typeof item.rawValue == "undefined") {
                    item.value = "";
                } else {
                    var values = item.rawValue.split(FEEDBACK_LINE_SEP);
                    angular.forEach(item.choices, function(choice) {
                        for (var x in values) {
                            if (choice.value == values[x]) {
                                choice.checked = true;
                                return;
                            }
                        }
                    });
                }
            } else {
                item.value = typeof item.rawValue != "undefined" ? parseInt(item.rawValue, 10) : "";
            }

            return item;
        }

        function getItemFormCaptcha(item) {
            item.template = 'captcha';
            item.value = "";
            return item;
        }
    };

    /**
     * Get a single feedback page items. If offline or server down it will use getItems to calculate dependencies.
     *
     * @module mm.addons.mod_feedback
     * @ngdoc method
     * @name $mmaModFeedbackHelper#getPageItems
     * @param   {Number}    feedbackId      Feedback ID.
     * @param   {Number}    page            The page to get.
     * @param   {Boolean}   offline         True if it should return cached data. Has priority over ignoreCache.
     * @param   {Boolean}   ignoreCache     True if it should ignore cached data (it will always fail in offline or server down).
     * @return  {Promise}                   Promise resolved when the info is retrieved.
     */
    self.getPageItems = function(feedbackId, page, offline, ignoreCache) {
        return $mmaModFeedback.getPageItems(feedbackId, page).then(function(response) {
            return fillValues(feedbackId, response.items, offline, ignoreCache).then(function(items) {
                response.items = items;
                return response;
            });
        }).catch(function() {
            // If getPageItems fail we should calculate it using getItems.
            return $mmaModFeedback.getItems(feedbackId).then(function(response) {
                return fillValues(feedbackId, response.items, offline, ignoreCache).then(function(items) {
                    // Separate items by pages.
                    var pageItems = [],
                        currentPage = 0,
                        previousPageItems = [],

                    pageItems = items.filter(function(item) {
                        // Greater page, discard all entries.
                        if (currentPage > page) {
                            return false;
                        }

                        if (item.typ == "pagebreak") {
                            currentPage++;
                            return false;
                        }

                        // Save items on previous page to check dependencies and discard entry.
                        if (currentPage < page) {
                            previousPageItems.push(item);
                            return false;
                        }

                        // Filter depending items.
                        if (item && item.dependitem > 0 && previousPageItems.length > 0) {
                            return checkDependencyItem(previousPageItems, item);
                        }

                        // Filter items with errors.
                        return item;
                    });

                    // Check if there are more pages.
                    response.hasprevpage = page > 0;
                    response.hasnextpage = currentPage > page;
                    response.items = pageItems;

                    return response;
                });
            });
        });
    };

    /**
     * Fill values of item questions.
     *
     * @param   {Number}   feedbackId Feedback ID.
     * @param   {Array}    items      Item to fill the value.
     * @return  {Promise}             Resolved with values when done.
     */
    function fillValues(feedbackId, items, offline, ignoreCache) {
        return $mmaModFeedback.getCurrentValues(feedbackId, offline, ignoreCache).then(function(values) {
            angular.forEach(items, function(itemData) {
                if (!itemData.hasvalue) {
                    return;
                }

                for (var x in values) {
                    if (values[x].item == itemData.id) {
                        itemData.rawValue = values[x].value;
                        return;
                    }
                }
            });
            return items;
        }).catch(function() {
            // Ignore errors.
            return items;
        });
    }

    /**
     * Check dependency of a question item.
     *
     * @param   {Array}     tems       All question items to check dependency.
     * @param   {Number}    item       Item to check.
     * @return  {Boolean}              Return true if dependency is acomplished and it can be shown. False, otherwise.
     */
    function checkDependencyItem(items, item) {
        var depend;
        for (var x in items) {
            if (items[x].id == item.dependitem) {
                depend = items[x];
                break;
            }
        }

        // Item not found, looks like dependent item has been removed or is in the same or following pages.
        if (!depend) {
            return true;
        }

        var value;
        switch (depend.typ) {
            case 'label':
                return false;
            case 'multichoice':
            case 'multichoicerated':
                return compareDependItemMultichoice(depend, item.dependvalue);
        }

        return item.dependvalue == depend.rawValue;

        // Helper functions by type:
        function compareDependItemMultichoice(item, dependValue) {
            var values, choices,
                parts = item.presentation.split(FEEDBACK_MULTICHOICE_TYPE_SEP) || [],
                subtype = parts.length > 0 && parts[0] ? parts[0] : 'r';

            choices = parts[1] || '';
            choices = choices.split(FEEDBACK_MULTICHOICE_ADJUST_SEP)[0] || '';
            choices = choices.split(FEEDBACK_LINE_SEP) || [];


            if (subtype === 'c') {
                if (typeof item.rawValue == "undefined") {
                    values = [''];
                } else {
                    values = item.rawValue.split(FEEDBACK_LINE_SEP);
                }
            } else {
                values = [item.rawValue];
            }

            for (var index = 0; index < choices.length; index++) {
                for (var x in values) {
                    if (values[x] == index + 1) {
                        var value = choices[index];
                        if (item.typ == 'multichoicerated') {
                            value = value.split(FEEDBACK_MULTICHOICERATED_VALUE_SEP)[1] || '';
                        }
                        if (value.trim() == dependValue) {
                            return true;
                        }
                        // We can finish checking if only searching on one value and we found it.
                        if (values.length == 1) {
                            return false;
                        }
                    }
                }
            }
            return false;
        }
    }

    /**
     * Get page items responses to be sent.
     *
     * @module mm.addons.mod_feedback
     * @ngdoc method
     * @name $mmaModFeedbackHelper#getPageItemsResponses
     * @param   {Array}    items      Items where the values are.
     * @return  {Object}              Responses object to be sent.
     */
    self.getPageItemsResponses = function(items) {
        var responses = {};

        angular.forEach(items, function(itemData) {
            if (itemData.hasvalue || itemData.typ == "captcha") {
                var name, value,
                    nameTemp = itemData.typ + '_' + itemData.id,
                    answered = false;
                if (itemData.typ == "multichoice" && itemData.subtype == 'c') {
                    name = nameTemp + '[0]';
                    responses[name] = 0;
                    angular.forEach(itemData.choices, function(choice, index) {
                        name = nameTemp + '[' + (index + 1) + ']';
                        value = choice.checked ? choice.value : 0;
                        if (!answered && value) {
                            answered = true;
                        }
                        responses[name] = value;
                    });
                } else {
                    if (itemData.typ == "multichoice") {
                        name = nameTemp + '[0]';
                        value = itemData.value || 0;
                    } else if (itemData.typ == "multichoicerated") {
                        name = nameTemp;
                        value = itemData.value || 0;
                    } else {
                        name = nameTemp;
                        value = itemData.value || "";
                    }

                    answered = !!value;
                    responses[name] = value;
                }

                if (itemData.required && !answered) {
                    // Check if it has any value.
                    itemData.isEmpty = true;
                } else {
                    itemData.isEmpty = false;
                }
            }
        });

        return responses;
    };

    /**
     * Returns the feedback user responses with extra info.
     *
     * @module mm.addons.mod_feedback
     * @ngdoc method
     * @name $mmaModFeedbackHelper#getResponsesAnalysis
     * @param   {Number}    feedbackId      Feedback ID.
     * @param   {Number}    groupId         Group id, 0 means that the function will determine the user group.
     * @param   {Number}    page            The page of records to return.
     * @return  {Promise}                   Promise resolved when the info is retrieved.
     */
    self.getResponsesAnalysis = function(feedbackId, groupId, page) {
        return $mmaModFeedback.getResponsesAnalysis(feedbackId, groupId, page).then(function(responses) {
            var promises = [];

            angular.forEach(responses.attempts, function(attempt) {
                promises.push($mmUser.getProfile(attempt.userid, attempt.courseid, true).then(function(user) {
                    attempt.profileimageurl = user.profileimageurl;
                }).catch(function() {
                    // Error getting profile, resolve promise without adding any extra data.
                }));
            });

            return $q.all(promises).then(function() {
                return responses;
            });
        });
    };


    /**
     * Retrieves a list of students who didn't submit the feedback with extra info.
     *
     * @module mm.addons.mod_feedback
     * @ngdoc method
     * @name $mmaModFeedbackHelper#getNonRespondents
     * @param   {Number}    feedbackId      Feedback ID.
     * @param   {Number}    groupId         Group id, 0 means that the function will determine the user group.
     * @param   {Number}    page            The page of records to return.
     * @return  {Promise}                   Promise resolved when the info is retrieved.
     */
    self.getNonRespondents = function(feedbackId, groupId, page) {
        return $mmaModFeedback.getNonRespondents(feedbackId, groupId, page).then(function(responses) {
            var promises = [];

            angular.forEach(responses.users, function(user) {
                promises.push($mmUser.getProfile(user.userid, user.courseid, true).then(function(u) {
                    user.profileimageurl = u.profileimageurl;
                }).catch(function() {
                    // Error getting profile, resolve promise without adding any extra data.
                }));
            });

            return $q.all(promises).then(function() {
                return responses;
            });
        });
    };

    return self;
});
