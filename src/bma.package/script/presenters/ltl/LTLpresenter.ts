// Copyright (c) Microsoft Research 2016
// License: MIT. See LICENSE
module BMA {
    export module Presenters {
        export class LTLPresenter {

            keyframescompact: BMA.UIDrivers.IKeyframesList;
            appModel: BMA.Model.AppModel;
            currentdraggableelem: any;
            expandedResults: JQuery;

            ltlviewer: BMA.UIDrivers.ILTLViewer;
            tppresenter: BMA.LTL.TemporalPropertiesPresenter;
            statespresenter: BMA.LTL.StatesPresenter;

            constructor(
                commands: BMA.CommandRegistry,
                appModel: BMA.Model.AppModel,
                statesEditorDriver: BMA.UIDrivers.IStatesEditor,
                temporlapropertieseditor: BMA.UIDrivers.ITemporalPropertiesEditor,
                ltlviewer: BMA.UIDrivers.ILTLViewer,
                ltlresultsviewer: BMA.UIDrivers.ILTLResultsViewer,
                ltlSimlationService: BMA.UIDrivers.IServiceDriver,
                ltlPolarityService: BMA.UIDrivers.IServiceDriver,
                lraLtlPolarityService: BMA.UIDrivers.IServiceDriver,
                popupViewer: BMA.UIDrivers.IPopup,
                exportService: BMA.UIDrivers.IExportService,
                fileLoaderDriver: BMA.UIDrivers.IFileLoader,
                logService: ISessionLog
            ) {

                var that = this;
                this.appModel = appModel;
                this.ltlviewer = ltlviewer;
                this.statespresenter = new BMA.LTL.StatesPresenter(commands, this.appModel, statesEditorDriver, ltlviewer.GetStatesViewer());

                temporlapropertieseditor.SetStates(appModel.States);

                window.Commands.On("LTLTabExpand", (args) => {
                    ltlviewer.ShowTabWaitIcon();
                    
                    if (this.tppresenter === undefined) {

                        //For faster reaction time
                        setTimeout(() => {
                            temporlapropertieseditor.Show();
                            this.tppresenter = new BMA.LTL.TemporalPropertiesPresenter(
                                commands,
                                appModel,
                                ltlSimlationService,
                                ltlPolarityService,
                                lraLtlPolarityService,
                                temporlapropertieseditor,
                                that.statespresenter,
                                logService);
                            temporlapropertieseditor.Hide();
                            ltlviewer.GetTemporalPropertiesViewer().Refresh();
                            ltlviewer.HideTabWaitIcon();
                        }, 1000);

                    } else {
                        ltlviewer.GetTemporalPropertiesViewer().Refresh();
                        this.tppresenter.RunAllQueries();
                        ltlviewer.HideTabWaitIcon();
                    }

                });

                statesEditorDriver.SetModel(appModel.BioModel, appModel.Layout);
                window.Commands.On("AppModelChanged", (args) => {
                    statesEditorDriver.SetModel(appModel.BioModel, appModel.Layout);
                    statesEditorDriver.SetStates(appModel.States);
                    ltlviewer.GetStatesViewer().SetStates(appModel.States);
                    //TP presenter should normally handle this but in case it was not shown and user tryies to modify states for imported states and formulas
                    if (this.tppresenter === undefined) {
                        this.UpdateOperations(appModel.States);
                    }
                });

                window.Commands.On("Expand", (param) => {
                    switch (param) {
                        case "LTLStates":
                            statesEditorDriver.Show();
                            break;

                        case "LTLTempProp":
                            temporlapropertieseditor.Show();

                            commands.Execute("TemporalPropertiesEditorExpanded", {});

                            if (this.tppresenter === undefined) {
                                this.tppresenter = new BMA.LTL.TemporalPropertiesPresenter(
                                    commands,
                                    appModel,
                                    ltlSimlationService,
                                    ltlPolarityService,
                                    lraLtlPolarityService,
                                    temporlapropertieseditor,
                                    this.statespresenter,
                                    logService);
                            }

                            break;
                        default:
                            ltlviewer.Show(undefined);
                            break;
                    }
                });

                window.Commands.On("Collapse", (param) => {
                    temporlapropertieseditor.Hide();
                    statesEditorDriver.Hide();
                    ltlresultsviewer.Hide();
                    popupViewer.Hide();
                });

                window.Commands.On("ModelReset", (args) => {
                    var ops = [];
                    for (var i = 0; i < appModel.Operations.length; i++) {
                        ops.push({
                            operation: appModel.Operations[i].Clone(),
                            status: "nottested"
                        });
                    }

                    ltlviewer.GetTemporalPropertiesViewer().SetOperations(ops);
                });

                window.Commands.On("InvalidStatesImported", (args) => {
                    var userDialog = $('<div></div>').appendTo('body').userdialog({
                        message: "States was imported incorrectly.",
                        actions: [
                            {
                                button: 'Ok',
                                callback: function () { userDialog.detach(); }
                            }
                        ]
                    });
                });

                //window.Commands.On("LTLRequested",(args) => {
                //    ltlviewer.GetTemporalPropertiesViewer().Refresh();
                //});

                commands.On("TemporalPropertiesOperationsChanged", (args) => {
                    ltlviewer.GetTemporalPropertiesViewer().SetOperations(args);
                });

                var ltlDataToExport = undefined;
                commands.On("ShowLTLResults", (args) => {
                    ltlDataToExport = {
                        ticks: args.ticks,
                        model: appModel.BioModel.Clone(),
                        layout: appModel.Layout.Clone()
                    };
                    ltlresultsviewer.Show();
                    ltlresultsviewer.SetData(appModel.BioModel, appModel.Layout, args.ticks, appModel.States);
                });

                ltlresultsviewer.SetOnExportCSV(function () {
                    if (ltlDataToExport !== undefined) {
                        exportService.Export(that.CreateCSV(ltlDataToExport, ","), "ltl", "csv");
                    }
                });

                ltlresultsviewer.SetOnCreateStateRequested(function (args) {
                    that.CreateStateFromTableData(args);
                    ltlresultsviewer.UpdateStateFromModel(that.appModel.BioModel, that.appModel.States);
                });

                window.Commands.On("CreateStateFromTable", (args) => {
                    that.CreateStateFromTableData(args);
                });

                commands.On("ExportLTLFormulaAsJson", (args) => {
                    if (args.operation !== undefined) {
                        exportService.Export(JSON.stringify(BMA.Model.ExportOperation(args.operation, true)), "operation", "json");
                    }
                });

                commands.On("ExportLTLFormulaAsText", (args) => {
                    if (args.operation !== undefined) {
                        exportService.Export(BMA.ModelHelper.ConvertOperationToString(args.operation), "operation", "txt");
                    }
                });

                commands.On("ExportLTLFormulaAsTextExtended", (args) => {
                    if (args.operation !== undefined) {
                        exportService.Export(BMA.ModelHelper.ConvertOperationToString(args.operation, true), "operation", "txt");
                    }
                });


                commands.On("ImportLTLFormulaAsJson", (args) => {
                    fileLoaderDriver.OpenFileDialog().done(function (fileName) {
                        var fileReader: any = new FileReader();
                        fileReader.onload = function () {
                            var fileContent = fileReader.result;
                            var obj = JSON.parse(fileContent);
                            var operation = BMA.Model.ImportOperand(obj, undefined);

                            if (operation instanceof BMA.LTLOperations.Operation) {
                                var op = <BMA.LTLOperations.Operation>operation;
                                var states = that.GetStates(op);
                                var statesChanged = BMA.ModelHelper.UpdateStatesWithModel(that.appModel.BioModel, that.appModel.Layout, states);
                                if (statesChanged.isChanged) {
                                    states = statesChanged.states;
                                    BMA.LTLOperations.RefreshStatesInOperation(op, states);
                                }
                                if (statesChanged.shouldNotify) window.Commands.Execute("InvalidStatesImported", {});
                                var merged = BMA.ModelHelper.MergeStates(that.appModel.States, states);
                                that.appModel.States = merged.states;
                                that.UpdateOperationStates(op, merged.map);
                                that.statespresenter.UpdateStatesFromModel();
                                that.tppresenter.UpdateStatesFromModel();
                                that.tppresenter.AddOperation(op, args.position);
                            }

                        };
                        fileReader.readAsText(fileName);

                    });
                });

                commands.On("ImportLTLFormulaAsText", (args) => {
                    fileLoaderDriver.OpenFileDialog().done(function (fileName) {
                        var fileReader: any = new FileReader();
                        fileReader.onload = function () {
                            var fileContent = fileReader.result;
                            var result = BMA.ModelHelper.ConvertFormulaToOperation(fileContent, that.appModel.States, that.appModel.BioModel);
                            var operation = result.operation;

                            if (operation instanceof BMA.LTLOperations.Operation) {
                                var op = <BMA.LTLOperations.Operation>operation;
                                var states = result.states;//that.GetStates(op);
                                var statesChanged = BMA.ModelHelper.UpdateStatesWithModel(that.appModel.BioModel, that.appModel.Layout, states);
                                if (statesChanged.isChanged) {
                                    states = statesChanged.states;
                                    BMA.LTLOperations.RefreshStatesInOperation(op, states);
                                }
                                if (statesChanged.shouldNotify) window.Commands.Execute("InvalidStatesImported", {});
                                var merged = BMA.ModelHelper.MergeStates(that.appModel.States, states);
                                that.appModel.States = merged.states;
                                that.UpdateOperationStates(op, merged.map);
                                that.statespresenter.UpdateStatesFromModel();
                                that.tppresenter.UpdateStatesFromModel();
                                that.tppresenter.AddOperation(op, args.position);
                            }

                        };
                        fileReader.readAsText(fileName);

                    });
                });

                commands.On("KeyframesChanged", (args: { states: BMA.LTLOperations.Keyframe[] }) => {
                    //TP presenter should normally handle this but in case it was not shown and user tries to modify states for imported states and formulas
                    if (this.tppresenter === undefined) {
                        this.UpdateOperations(args.states);
                    }
                });
            }

            private CreateStateFromTableData(args) {
                var that = this;
                if (args !== undefined) {
                    var keyframeEqs = [];
                    for (var i = 0; i < args.length; i++) {
                        keyframeEqs.push(new BMA.LTLOperations.KeyframeEquation(
                            new BMA.LTLOperations.NameOperand(args[i].variable, args[i].variableId),
                            args[i].operator ? args[i].operator : "=",
                            new BMA.LTLOperations.ConstOperand(args[i].value)
                        ));
                    }

                    var stateName = BMA.ModelHelper.GenerateStateName(that.appModel.States, undefined);
                    var newState = new BMA.LTLOperations.Keyframe(stateName, "", keyframeEqs);
                    var merged = BMA.ModelHelper.MergeStates(that.appModel.States, [newState]);
                    that.appModel.States = merged.states;
                    that.statespresenter.UpdateStatesFromModel();
                    if (that.tppresenter)
                        that.tppresenter.UpdateStatesFromModel();
                }
            }

            private UpdateOperations(states) {
                var operations = this.appModel.Operations.slice(0);
                var opsWithStatus = [];
                if (operations !== undefined && operations.length > 0) {
                    for (var i = 0; i < operations.length; i++) {
                        BMA.LTLOperations.RefreshStatesInOperation(operations[i], states);
                        opsWithStatus.push({
                            operation: operations[i],
                            status: "nottested"
                        });
                    }
                }
                this.appModel.Operations = operations;
                this.ltlviewer.GetTemporalPropertiesViewer().SetOperations(opsWithStatus);
            }

            private UpdateOperationStates(operation: BMA.LTLOperations.Operation, map: any) {
                var that = this;
                for (var i = 0; i < operation.Operands.length; i++) {
                    var op = operation.Operands[i];
                    if (op instanceof BMA.LTLOperations.Keyframe) {
                        if (map[(<BMA.LTLOperations.Keyframe>op).Name])
                            (<BMA.LTLOperations.Keyframe>op).Name = map[(<BMA.LTLOperations.Keyframe>op).Name];
                        else op = undefined;
                    } else if (op instanceof BMA.LTLOperations.Operation) {
                        that.UpdateOperationStates(<BMA.LTLOperations.Operation>op, map);
                    }
                }
            }

            private GetStates(operation: BMA.LTLOperations.Operation): BMA.LTLOperations.Keyframe[] {
                var that = this;
                var result = [];

                for (var i = 0; i < operation.Operands.length; i++) {
                    var op = operation.Operands[i];
                    if (op !== undefined && op !== null) {
                        if (op instanceof BMA.LTLOperations.Keyframe) {
                            result.push(<BMA.LTLOperations.Keyframe>op.Clone());
                        } else if (op instanceof BMA.LTLOperations.Operation) {
                            var states = that.GetStates(<BMA.LTLOperations.Operation>op);
                            for (var j = 0; j < states.length; j++) {
                                result.push(states[j]);
                            }
                        }
                    }
                }

                return result;
            }


            public CreateCSV(ltlDataToExport, sep): string {
                var csv = '';
                var that = this;

                var variables = (<BMA.Model.BioModel>ltlDataToExport.model).Variables;
                var ticks = ltlDataToExport.ticks.sort((x, y) => {
                    return x.Time < y.Time ? -1 : 1;
                });


                for (var i = 0; i < variables.length; i++) {

                    var variable = variables[i];
                    var cont = that.appModel.Layout.GetContainerById(variable.ContainerId);

                    if (cont !== undefined) {
                        csv += cont.Name + sep;
                    } else {
                        csv += '' + sep;
                    }

                    csv += variable.Name + sep;

                    for (var j = 0; j < ticks.length; j++) {
                        var tick = ticks[j].Variables;
                        for (var k = 0; k < tick.length; k++) {
                            var ij = tick[k];
                            if (ij.Id === variable.Id) {
                                if (ij.Lo === ij.Hi) {
                                    csv += ij.Lo + sep;
                                }
                                else {
                                    csv += ij.Lo + ' - ' + ij.Hi + sep;
                                }

                                break;
                            }
                        }
                    }

                    csv += "\n";
                }

                return csv;
            }

        }
    }
} 
