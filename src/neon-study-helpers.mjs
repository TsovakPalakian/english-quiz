export const neonStudyHelpers=[
  'CREATE SCHEMA IF NOT EXISTS english_study',
  'REVOKE ALL ON SCHEMA english_study FROM PUBLIC',
  `CREATE OR REPLACE FUNCTION english_study.json_path(path text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
  DECLARE result text[]='{}'; piece text[];
  BEGIN
    IF path='$' THEN RETURN result; END IF;
    IF left(path,2)<>'$.' OR length(path)>4000 THEN RAISE EXCEPTION 'Unsupported JSON path'; END IF;
    FOR piece IN SELECT regexp_matches(substring(path FROM 3),'"((?:[^"\\\\]|\\\\.)*)"|([^.[\\]]+)|\\[([0-9]+)\\]','g') LOOP
      result=array_append(result,CASE WHEN piece[1] IS NOT NULL THEN ('"'||piece[1]||'"')::jsonb #>> '{}' ELSE COALESCE(piece[2],piece[3]) END);
    END LOOP;
    RETURN result;
  END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.json_put(doc jsonb,path text[],value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
  DECLARE child jsonb;
  BEGIN
    IF cardinality(path)=0 THEN RETURN value; END IF;
    IF doc IS NULL OR jsonb_typeof(doc) NOT IN ('array','object') THEN doc='{}'::jsonb; END IF;
    IF cardinality(path)=1 THEN RETURN jsonb_set(doc,path,value,true); END IF;
    child=doc #> path[1:1];
    RETURN jsonb_set(doc,path[1:1],english_study.json_put(child,path[2:cardinality(path)],value),true);
  END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.json_extract(doc text,path text) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
  DECLARE value jsonb;
  BEGIN
    value=jsonb_path_query_first(doc::jsonb,path::jsonpath);
    RETURN CASE jsonb_typeof(value) WHEN 'null' THEN NULL WHEN 'boolean' THEN CASE WHEN value='true'::jsonb THEN '1' ELSE '0' END WHEN 'object' THEN value::text WHEN 'array' THEN value::text ELSE value #>> '{}' END;
  END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.json_scalar(doc text,path text) RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$ SELECT jsonb_path_query_first(doc::jsonb,path::jsonpath) $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.json_number(value text) RETURNS numeric LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$ SELECT CASE value WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE value::numeric END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.json_valid(doc text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
  BEGIN PERFORM doc::jsonb; RETURN true; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.json_type(doc text,path text DEFAULT '$') RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
  DECLARE value jsonb; kind text;
  BEGIN value=jsonb_path_query_first(doc::jsonb,path::jsonpath);kind=jsonb_typeof(value);
    RETURN CASE WHEN kind='boolean' THEN value::text WHEN kind='string' THEN 'text' WHEN kind='number' THEN CASE WHEN value::text ~ '^[+-]?[0-9]+$' THEN 'integer' ELSE 'real' END ELSE kind END;
  END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.json_patch(doc jsonb,patch jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
  DECLARE item record;
  BEGIN
    IF jsonb_typeof(patch)<>'object' THEN RETURN patch; END IF;
    IF doc IS NULL OR jsonb_typeof(doc)<>'object' THEN doc='{}'::jsonb; END IF;
    FOR item IN SELECT key,value FROM jsonb_each(patch) LOOP
      IF item.value='null'::jsonb THEN doc=doc-item.key;
      ELSE doc=jsonb_set(doc,ARRAY[item.key],english_study.json_patch(doc->item.key,item.value),true); END IF;
    END LOOP; RETURN doc;
  END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.instr(haystack text,needle text) RETURNS integer LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$ SELECT strpos(haystack,needle) $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.track_before() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
  BEGIN IF pg_trigger_depth()=1 THEN PERFORM set_config('english_study.pending','0',true); END IF; RETURN NULL; END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.track_row() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
  DECLARE value text;
  BEGIN
    IF pg_trigger_depth()=1 THEN
      PERFORM set_config('english_study.pending',(COALESCE(NULLIF(current_setting('english_study.pending',true),''),'0')::bigint+1)::text,true);
      IF TG_OP='INSERT' THEN value=to_jsonb(NEW)->>TG_ARGV[0]; IF value IS NOT NULL THEN PERFORM set_config('english_study.last_id',value,true); END IF; END IF;
    END IF; RETURN NULL;
  END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.track_after() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
  BEGIN IF pg_trigger_depth()=1 THEN PERFORM set_config('english_study.changes',COALESCE(NULLIF(current_setting('english_study.pending',true),''),'0'),true); END IF; RETURN NULL; END $fn$`,
  `CREATE OR REPLACE FUNCTION english_study.learning_notice() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
  BEGIN IF NEW.category='learning' THEN INSERT INTO english_study.chat_delivery_outbox(message_id) VALUES(NEW.id) ON CONFLICT DO NOTHING; END IF; RETURN NULL; END $fn$`
];

export function studyTracking(table,id){
  if(!/^(?:english_study|pg_temp)\.[a-z_]+$/.test(table)||!/^[a-z_]+$/.test(id))throw Error('Invalid tracking metadata');
  return [
    `CREATE OR REPLACE TRIGGER study_before BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION english_study.track_before()`,
    `CREATE OR REPLACE TRIGGER study_row AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION english_study.track_row('${id}')`,
    `CREATE OR REPLACE TRIGGER study_after AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION english_study.track_after()`
  ];
}
