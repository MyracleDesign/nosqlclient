import { Communicator, ReactivityProvider } from '/client/imports/facades';
import { Notification, ErrorHandler, SessionManager, UIComponents } from '/client/imports/modules';

const UserManagementRoles = function () {

};

const proceedCreatingCollectionsCombobox = function (cmb, collectionToSelect, cmbGroup, stopLadda) {
  cmb.chosen({
    create_option: true,
    allow_single_deselect: true,
    persistent_create_option: true,
    skip_no_results: true,
  });

  if (collectionToSelect) {
    if (cmbGroup.find(`option[value = ${collectionToSelect}]`).length === 0) {
      cmbGroup.append($('<option></option>')
        .attr('value', collectionToSelect)
        .text(collectionToSelect));
    }
    cmb.val(collectionToSelect);
  }
  cmb.trigger('chosen:updated');

  if (stopLadda) Notification.stop();
};

UserManagementRoles.prototype = {
  addInheritRole() {
    const db = $('#cmbDatabasesForInheritRole').val();
    const role = $('#cmbRolesForDBForInheritedRole').val();

    if (!db) {
      Notification.warning('Database is required !');
      return;
    }
    if (!role) {
      Notification.warning('Role is required !');
      return;
    }

    const table = $('#tblRolesToInherit').DataTable();
    const currentDatas = table.rows().data();
    for (let i = 0; i < currentDatas.length; i += 1) {
      if (currentDatas[i].db === db && currentDatas[i].role === role) {
        Notification.error(`<b>${role}</b>@${db} already exists !`);
        return;
      }
    }

    const objectToAdd = { role, db };
    if (table.rows().data().length === 0) this.populateRolesToInheritTable(null, [objectToAdd]);
    else table.row.add(objectToAdd).draw();

    Notification.success(`<b>${role}</b>@${db} successfuly added`);
  },

  applyPrivilegeToRole() {
    const cmbPrivilegeSelector = $('#cmbPrivilegeResource');
    const cmbPrivilegeCollection = $('#cmbPrivilegeCollection');

    const actions = $('#cmbActionsOfPrivilege').val();
    let resource = cmbPrivilegeSelector.val() ? cmbPrivilegeSelector.val() : '';
    if (cmbPrivilegeCollection.val() && resource !== 'anyResource' && resource !== 'cluster') {
      if (resource) resource = `<b>${cmbPrivilegeCollection.val()}</b>@${resource}`;
      else resource = `<b>${cmbPrivilegeCollection.val()}</b>`;
    }
    if (!actions) {
      Notification.warning('At least one action is required !');
      return;
    }

    const privilegesTableSelector = $('#tblRolePrivileges').DataTable();
    if ($('#addEditPrivilegeModalTitle').text() === 'Edit Privilege') {
      // edit existing privilege of role
      const selectedRowData = SessionManager.get(SessionManager.strSessionUsermanagementPrivilege);

      privilegesTableSelector.rows().every(function () {
        const privilegesData = this.data();
        if (_.isEqual(privilegesData.privilege, selectedRowData.privilege)
          && privilegesData.resource === selectedRowData.resource) {
          privilegesData.privilege = actions;
          privilegesData.resource = resource;
        }

        this.invalidate();
      });

      privilegesTableSelector.draw();
    } else {
      const objectToAdd = {
        privilege: actions,
        resource,
      };

      if (privilegesTableSelector.rows().data().length === 0) this.populateRolePrivilegesTable(null, [objectToAdd]);
      else privilegesTableSelector.row.add(objectToAdd).draw();
    }

    $('#addPrivilegeToRoleModal').modal('hide');
  },

  saveRole() {
    const titleSelector = $('#addEditRoleModalTitle');
    const roleNameSelector = $('#inputRoleUM');

    if (SessionManager.get(SessionManager.strSessionUsermanagementRole) && SessionManager.get(SessionManager.strSessionUsermanagementRole).isBuiltin && titleSelector.text() === 'Edit Role') {
      Notification.warning('Cannot change builtin roles !');
      return;
    }
    if ($('#tblRolePrivileges').DataTable().rows().data().length === 0) {
      Notification.warning('At least one privilege is required !');
      return;
    }
    if (!roleNameSelector.val()) {
      Notification.warning('Role name is required !');
      return;
    }

    const command = {};
    if (titleSelector.text() === 'Edit Role') command.updateRole = roleNameSelector.val();
    else command.createRole = roleNameSelector.val();

    command.privileges = this.populatePrivilegesToSave();
    command.roles = this.populateInheritRolesToSave();

    Notification.start('#btnApplyAddEditRole');

    const runOnAdminDB = $('#aRunOnAdminDBToFetchUsers').iCheck('update')[0].checked;

    Communicator.call({
      methodName: 'command',
      args: { command, runOnAdminDB },
      callback: (err, result) => {
        if (err || result.error) ErrorHandler.showMeteorFuncError(err, result, "Couldn't update role");
        else {
          this.initRoles();
          if ($('#addEditRoleModalTitle').text() === 'Edit Role') Notification.success('Successfuly updated role !');
          else Notification.success('Successfuly added role !');

          $('#editRoleModal').modal('hide');
        }
      }
    });
  },

  addNewInheritRoleToRole() {
    if (SessionManager.get(SessionManager.strSessionUsermanagementRole) &&
      SessionManager.get(SessionManager.strSessionUsermanagementRole).isBuiltin && $('#addEditRoleModalTitle').text() === 'Edit Role') {
      Notification.warning('Cannot add inherit roles to builtin roles !');
      return;
    }
    Notification.create('#btnAddInheritRole');

    this.initDatabasesForInheritRole();
    $('#addRoleToInherit').modal('show');
  },

  addNewPrivilegeToRole() {
    if (SessionManager.get(SessionManager.strSessionUsermanagementRole) &&
      SessionManager.get(SessionManager.strSessionUsermanagementRole).isBuiltin && $('#addEditRoleModalTitle').text() === 'Edit Role') {
      Notification.warning('Cannot add new privileges to builtin roles !');
      return;
    }

    $('#addEditPrivilegeModalTitle').text('Add Privilege');
    $('#addEditPrivilegeModalText').text(`Role ${SessionManager.get(SessionManager.strSessionUsermanagementRole) ? SessionManager.get(SessionManager.strSessionUsermanagementRole).role : ''}`);

    Notification.start('#btnApplyAddPrivilegeToRole');

    this.initResourcesForPrivileges();
    this.initActionsForPrivilege();

    $('#addPrivilegeToRoleModal').modal('show');
  },

  startEditingRole() {
    if (!SessionManager.get(SessionManager.strSessionUsermanagementPrivilege)) return;

    $('#addEditPrivilegeModalTitle').text('Edit Privilege');
    $('#addEditPrivilegeModalText').text('');

    Notification.start('#btnApplyAddPrivilegeToRole');

    const selectedResource = SessionManager.get(SessionManager.strSessionUsermanagementPrivilege).resource;
    let dbToSelect = ''; let collectionToSelect = '';
    if (selectedResource && selectedResource !== 'anyResource' && selectedResource !== 'cluster') {
      if (selectedResource.indexOf('@') !== -1) {
        dbToSelect = selectedResource.substr(selectedResource.indexOf('@') + 1);
        collectionToSelect = selectedResource.substr(0, selectedResource.indexOf('@')).replace('<b>', '').replace('</b>', '');
      } else if (selectedResource.indexOf('<b>') !== -1) collectionToSelect = selectedResource.replace('<b>', '').replace('</b>', '');
      else dbToSelect = selectedResource;
    } else dbToSelect = selectedResource;


    this.initResourcesForPrivileges(dbToSelect, collectionToSelect);
    this.initActionsForPrivilege(SessionManager.get(SessionManager.strSessionUsermanagementPrivilege).privilege);

    $('#addPrivilegeToRoleModal').modal('show');
  },

  popEditRoleModal(role) {
    $('#addEditRoleModalTitle').text('Edit Role');

    Notification.start('#btnCloseUMRoles');

    const connection = ReactivityProvider.findOne(ReactivityProvider.types.Connections, { _id: SessionManager.get(SessionManager.strSessionConnection) });
    const runOnAdminDB = $('#aRunOnAdminDBToFetchUsers').iCheck('update')[0].checked;
    const dbName = runOnAdminDB ? 'admin' : connection.databaseName;
    const roleName = role || SessionManager.get(SessionManager.strSessionUsermanagementRole).role;

    const rolesInfoCommand = {
      rolesInfo: { role: roleName, db: dbName },
      showPrivileges: true,
    };

    Communicator.call({
      methodName: 'command',
      args: { command: rolesInfoCommand, runOnAdminDB },
      callback: (err, result) => {
        if (err || result.error) ErrorHandler.showMeteorFuncError(err, result, "Couldn't fetch roleInfo");
        else {
          const resultRole = result.result.roles[0];
          this.populateRolePrivilegesTable(resultRole);
          this.populateRolesToInheritTable(resultRole);

          const inputRoleNameSelector = $('#inputRoleUM');
          inputRoleNameSelector.val(resultRole.role);
          inputRoleNameSelector.prop('disabled', true);

          $('#editRoleModal').modal('show');
        }

        Notification.stop();
      }
    });
  },

  populateRolesToInheritTable(role, dataArray) {
    UIComponents.DataTable.setupDatatable({
      selectorString: '#tblRolesToInherit',
      data: dataArray || role.inheritedRoles,
      columns: [
        { data: 'role', width: '50%' },
        { data: 'db', width: '45%' },
      ],
      columnDefs: [
        {
          targets: [2],
          data: null,
          width: '5%',
          render() {
            if (role && role.isBuiltin) {
              return '<a href="" title="Not Allowed"><i class="fa fa-ban text-navy"></i></a>';
            }
            return '<a href="" title="Delete" class="editor_delete"><i class="fa fa-remove text-navy"></i></a>';
          },
        }
      ]
    });
  },

  populateRolePrivilegesTable(role, dataArray) {
    UIComponents.DataTable.setupDatatable({
      selectorString: '#tblRolePrivileges',
      data: dataArray || this.populateTableDataForRole(role),
      columns: [
        { data: 'privilege[, ]', width: '50%' },
        { data: 'resource', width: '40%' },
      ],
      columnDefs: [
        {
          targets: [2],
          data: null,
          width: '5%',
          render() {
            if (role && role.isBuiltin) {
              return '<a href="" title="Not Allowed"><i class="fa fa-ban text-navy"></i></a>';
            }

            return '<a href="" title="Edit" class="editor_edit_privilege"><i class="fa fa-edit text-navy"></i></a>';
          },
        },
        {
          targets: [3],
          data: null,
          width: '5%',
          render() {
            if (role && role.isBuiltin) {
              return '<a href="" title="Not Allowed"><i class="fa fa-ban text-navy"></i></a>';
            }
            return '<a href="" title="Delete" class="editor_delete"><i class="fa fa-remove text-navy"></i></a>';
          },
        },
      ]
    });
  },

  populateTableDataForRole(role) {
    const result = [];
    if (role.privileges) {
      for (let i = 0; i < role.privileges.length; i += 1) {
        result.push({
          privilege: role.privileges[i].actions,
          resource: this.getResource(role.privileges[i].resource),
        });
      }
    }

    return result;
  },

  getResource(resource) {
    if (!resource) return '';
    if (resource.anyResource) return 'anyResource';
    if (resource.cluster) return 'cluster';
    if (resource.db && resource.collection) return `<b>${resource.collection}</b>@${resource.db}`;
    if (resource.db) return resource.db;
    if (resource.collection) return `<b>${resource.collection}</b>`;

    return '';
  },

  getResourceObject(resourceString) {
    if (resourceString !== 'anyResource' && resourceString !== 'cluster') {
      const result = {};

      if (resourceString.indexOf('@') !== -1) {
        result.db = resourceString.substr(resourceString.indexOf('@') + 1);
        result.collection = resourceString.substr(0, resourceString.indexOf('@')).replace('<b>', '').replace('</b>', '');
      } else if (resourceString.indexOf('<b>') !== -1) {
        result.collection = resourceString.replace('<b>', '').replace('</b>', '');
        result.db = '';
      } else {
        result.db = resourceString;
        result.collection = '';
      }

      return result;
    } else if (resourceString === 'anyResource') return { anyResource: true };
    else if (resourceString === 'cluster') return { cluster: true };

    return { db: resourceString };
  },

  initResourcesForPrivileges(dbToSelect, collectionToSelect) {
    const cmb = $('#cmbPrivilegeResource');
    cmb.empty();
    cmb.prepend("<option value=''></option>");
    cmb.append($("<optgroup id='optCluster' label='Cluster'></optgroup>"));
    cmb.find('#optCluster').append($('<option></option>')
      .attr('value', 'cluster')
      .text('cluster'));
    cmb.append($("<optgroup id='optAnyResource' label='Any Resource'></optgroup>"));
    cmb.find('#optAnyResource').append($('<option></option>')
      .attr('value', 'anyResource')
      .text('anyResource'));
    cmb.append($("<optgroup id='optDB' label='Databases'></optgroup>"));

    const cmbDBGroup = cmb.find('#optDB');

    Communicator.call({
      methodName: 'getDatabases',
      callback: (err, result) => {
        if (err || result.error) ErrorHandler.showMeteorFuncError(err, result, "Couldn't fetch databases");
        else {
          for (let i = 0; i < result.result.length; i += 1) {
            cmbDBGroup.append($('<option></option>')
              .attr('value', result.result[i].name)
              .text(result.result[i].name));
          }
        }

        cmb.chosen({
          create_option: true,
          allow_single_deselect: true,
          persistent_create_option: true,
          skip_no_results: true,
        });

        if (dbToSelect) {
          if (dbToSelect !== 'anyResource' && dbToSelect !== 'cluster' &&
          cmbDBGroup.find(`option[value = ${dbToSelect}]`).length === 0) {
            cmbDBGroup.append($('<option></option>')
              .attr('value', dbToSelect)
              .text(dbToSelect));
          }

          cmb.val(dbToSelect);
        }
        cmb.trigger('chosen:updated');

        // empty combobox first.
        this.initCollectionsForPrivilege(collectionToSelect);
      }
    });
  },

  initCollectionsForPrivilege(collectionToSelect, db, stopLadda) {
    const cmb = $('#cmbPrivilegeCollection');
    cmb.empty();
    cmb.prepend("<option value=''></option>");

    cmb.append($("<optgroup id='optCollections' label='Collections'></optgroup>"));
    const cmbGroup = cmb.find('#optCollections');

    if (db) {
      Communicator.call({
        methodName: 'listCollectionNames',
        args: { dbName: db },
        callback: (err, result) => {
          if (err || result.error) ErrorHandler.showMeteorFuncError(err, result, "Couldn't fetch collection names");
          else {
            for (let i = 0; i < result.result.length; i += 1) {
              cmbGroup.append($('<option></option>')
                .attr('value', result.result[i].name)
                .text(result.result[i].name));
            }
          }
          proceedCreatingCollectionsCombobox(cmb, collectionToSelect, cmbGroup, stopLadda);
        }
      });
    } else proceedCreatingCollectionsCombobox(cmb, collectionToSelect, cmbGroup, stopLadda);
  },

  initActionsForPrivilege(actions) {
    const cmb = $('#cmbActionsOfPrivilege');
    cmb.empty();

    Communicator.call({
      methodName: 'getAllActions',
      callback: (err, result) => {
        if (err || result.error) ErrorHandler.showMeteorFuncError(err, result, "Couldn't fetch actions from docs.mongodb.org");
        else {
          for (let i = 0; i < result.length; i += 1) {
            cmb.append($('<option></option>')
              .attr('value', result[i])
              .text(result[i]));
          }
        }

        cmb.chosen({
          create_option: true,
          persistent_create_option: true,
          skip_no_results: true,
        });

        if (actions) {
          for (let j = 0; j < actions.length; j += 1) {
            if (cmb.find(`option[value = ${actions[j]}]`).length === 0) {
              cmb.append($('<option></option>')
                .attr('value', actions[j])
                .text(actions[j]));
            }
          }
          cmb.val(actions);
        }

        cmb.trigger('chosen:updated');
        Notification.stop();
      }
    });
  },

  initDatabasesForInheritRole() {
    const cmb = $('#cmbDatabasesForInheritRole');
    cmb.empty();

    Communicator.call({
      methodName: 'getDatabases',
      callback: (err, result) => {
        if (err || result.error) ErrorHandler.showMeteorFuncError(err, result, "Couldn't fetch databases");
        else {
          for (let i = 0; i < result.result.length; i += 1) {
            cmb.append($('<option></option>')
              .attr('value', result.result[i].name)
              .text(result.result[i].name));
          }
        }

        cmb.chosen({
          create_option: true,
          persistent_create_option: true,
          skip_no_results: true,
        });

        cmb.trigger('chosen:updated');
        this.initRolesForDBForInheritRole();
      }
    });
  },

  initRolesForDBForInheritRole() {
    const cmb = $('#cmbRolesForDBForInheritedRole');
    cmb.empty();
    cmb.prepend("<option value=''></option>");

    const runOnAdminDB = $('#aRunOnAdminDBToFetchUsers').iCheck('update')[0].checked;
    Communicator.call({
      methodName: 'command',
      args: { command: { rolesInfo: 1, showBuiltinRoles: true }, runOnAdminDB },
      callback: (err, result) => {
        if (err || result.error) ErrorHandler.showMeteorFuncError(err, result, "Couldn't fetch roles, please enter one manually");
        else {
          for (let i = 0; i < result.result.roles.length; i += 1) {
            cmb.append($('<option></option>')
              .attr('value', result.result.roles[i].role)
              .text(result.result.roles[i].role));
          }
        }

        cmb.chosen({
          create_option: true,
          persistent_create_option: true,
          skip_no_results: true,
        });

        cmb.trigger('chosen:updated');
        Notification.stop();
      }
    });
  },

  populatePrivilegesToSave() {
    const result = [];
    const privileges = $('#tblRolePrivileges').DataTable().rows().data();
    for (let i = 0; i < privileges.length; i += 1) {
      result.push({
        resource: this.getResourceObject(privileges[i].resource),
        actions: privileges[i].privilege,
      });
    }

    return result;
  },

  populateInheritRolesToSave() {
    const result = [];
    const rolesToInherit = $('#tblRolesToInherit').DataTable().rows().data();
    for (let i = 0; i < rolesToInherit.length; i += 1) {
      result.push({
        role: rolesToInherit[i].role,
        db: rolesToInherit[i].db,
      });
    }

    return result;
  },

  initRoles() {
    Notification.start('#btnCloseUMRoles');

    const command = {
      rolesInfo: 1,
      showBuiltinRoles: true,
    };

    const runOnAdminDB = $('#aRunOnAdminDBToFetchUsers').iCheck('update')[0].checked;

    Communicator.call({
      methodName: 'command',
      args: { command, runOnAdminDB },
      callback: (err, result) => {
        if (err || result.error) ErrorHandler.showMeteorFuncError(err, result, "Couldn't fetch roles");
        else {
          UIComponents.DataTable.setupDatatable({
            selectorString: '#tblRoles',
            data: result.result.roles,
            columns: [
              { data: 'role', width: '35%' },
              { data: 'db', width: '35%' },
              { data: 'isBuiltin', width: '20%' },
            ],
            columnDefs: [
              {
                targets: [3],
                data: null,
                width: '5%',
                render(data, type, full) {
                  if (!full.isBuiltin) {
                    return '<a href="" title="Edit" class="editor_edit"><i class="fa fa-edit text-navy"></i></a>';
                  }
                  return '<a href="" title="View" class="editor_edit"><i class="fa fa-eye text-navy"></i></a>';
                },
              },
              {
                targets: [4],
                data: null,
                width: '5%',
                render(data, type, full) {
                  if (!full.isBuiltin) {
                    return '<a href="" title="Delete" class="editor_delete_role"><i class="fa fa-remove text-navy"></i></a>';
                  }
                  return '<a href="" title="Not Allowed"><i class="fa fa-ban text-navy"></i></a>';
                },
              }
            ]
          });
        }
        Notification.stop();
      }
    });
  },

  deleteRole() {
    if (!SessionManager.get(SessionManager.strSessionUsermanagementRole)) return;
    Notification.modal({
      title: 'Are you sure ?',
      text: 'You can NOT recover this role afterwards, are you sure ?',
      type: 'warning',
      cancelButtonText: 'No',
      callback: (isConfirm) => {
        if (isConfirm) {
          Notification.start('#btnCloseUMRoles');

          const command = { dropRole: SessionManager.get(SessionManager.strSessionUsermanagementRole).role };
          const runOnAdminDB = $('#aRunOnAdminDBToFetchUsers').iCheck('update')[0].checked;

          Communicator.call({
            methodName: 'command',
            args: { command, runOnAdminDB },
            callback: (err, result) => {
              if (err || result.error) ErrorHandler.showMeteorFuncError(err, result, "Couldn't drop role");
              else {
                this.initRoles();
                Notification.success('Successfuly dropped role !');
              }
            }
          });
        }
      }
    });
  }
};

export default new UserManagementRoles();