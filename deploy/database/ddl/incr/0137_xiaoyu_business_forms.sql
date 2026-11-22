BEGIN;
ALTER TABLE yucer_agent.agent_task_draft DROP CONSTRAINT agent_task_draft_contract_version_check;
ALTER TABLE yucer_agent.agent_task_draft ADD CONSTRAINT agent_task_draft_contract_version_check CHECK(contract_version IN ('private-notes/1','business-form/1'));
ALTER TABLE yucer_agent.agent_task_reference DROP CONSTRAINT agent_task_reference_object_kind_check;
ALTER TABLE yucer_agent.agent_task_reference ADD CONSTRAINT agent_task_reference_object_kind_check CHECK(object_kind IN ('account','opportunity','lead','strategy','segment','product','solution','campaign','project','plan','judgement','sales_target','sales_plan','access'));
COMMIT;
