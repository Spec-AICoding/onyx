import os
import subprocess
import threading
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = Path(BACKEND_DIR) / ".env"

# Load .env so Celery workers pick up REDIS_HOST etc.
if ENV_FILE.exists():
    load_dotenv(ENV_FILE, override=True)


def monitor_process(process_name: str, process: subprocess.Popen) -> None:
    assert process.stdout is not None

    while True:
        output = process.stdout.readline()

        if output:
            print(f"{process_name}: {output.strip()}")

        if process.poll() is not None:
            break


def run_jobs() -> None:
    cmd_worker_primary = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.primary",
        "worker",
        "--pool=threads",
        "--concurrency=6",
        "--prefetch-multiplier=1",
        "--loglevel=INFO",
        "--hostname=primary@%n",
        "-Q",
        "celery",
    ]

    cmd_worker_light = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.light",
        "worker",
        "--pool=threads",
        "--concurrency=16",
        "--prefetch-multiplier=8",
        "--loglevel=INFO",
        "--hostname=light@%n",
        "-Q",
        "vespa_metadata_sync,connector_deletion,doc_permissions_upsert,checkpoint_cleanup,index_attempt_cleanup,index_reclaim,opensearch_migration",
    ]

    cmd_worker_docprocessing = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.docprocessing",
        "worker",
        "--pool=threads",
        "--concurrency=6",
        "--prefetch-multiplier=1",
        "--loglevel=INFO",
        "--hostname=docprocessing@%n",
        "--queues=docprocessing,port",
    ]

    cmd_worker_docfetching = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.docfetching",
        "worker",
        "--pool=threads",
        "--concurrency=1",
        "--prefetch-multiplier=1",
        "--loglevel=INFO",
        "--hostname=docfetching@%n",
        "--queues=connector_doc_fetching",
    ]

    cmd_worker_heavy = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.heavy",
        "worker",
        "--pool=threads",
        "--concurrency=4",
        "--prefetch-multiplier=1",
        "--loglevel=INFO",
        "--hostname=heavy@%n",
        "-Q",
        "connector_pruning,connector_doc_permissions_sync,connector_external_group_sync,csv_generation,sandbox,capability_checks",
    ]

    cmd_worker_monitoring = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.monitoring",
        "worker",
        "--pool=threads",
        "--concurrency=1",
        "--prefetch-multiplier=1",
        "--loglevel=INFO",
        "--hostname=monitoring@%n",
        "-Q",
        "monitoring",
    ]

    cmd_worker_user_file_processing = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.user_file_processing",
        "worker",
        "--pool=threads",
        "--concurrency=2",
        "--prefetch-multiplier=1",
        "--loglevel=INFO",
        "--hostname=user_file_processing@%n",
        "-Q",
        "user_file_processing,user_file_project_sync,user_file_delete,user_file_port",
    ]

    cmd_worker_scheduled_tasks = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.scheduled_tasks",
        "worker",
        "--pool=threads",
        "--concurrency=4",
        "--prefetch-multiplier=1",
        "--loglevel=INFO",
        "--hostname=scheduled_tasks@%n",
        "-Q",
        "scheduled_tasks",
    ]

    cmd_beat = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.beat",
        "beat",
        "--loglevel=INFO",
    ]

    cmd_worker_graph_processing = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.graph_processing",
        "worker",
        "--pool=threads",
        "--concurrency=2",
        "--prefetch-multiplier=1",
        "--loglevel=INFO",
        "--hostname=graph_processing@%n",
        "-Q",
        "graph_processing",
    ]

    cmd_worker_graph_acl_push = [
        "celery",
        "-A",
        "onyx.background.celery.versioned_apps.graph_acl_push",
        "worker",
        "--pool=threads",
        "--concurrency=2",
        "--prefetch-multiplier=1",
        "--loglevel=INFO",
        "--hostname=graph_acl_push@%n",
        "-Q",
        "graph_acl_push",
    ]

    all_workers = [
        # Essential: BEAT (scheduler) + PRIMARY (default queue) must run together
        ("PRIMARY", cmd_worker_primary),
        ("LIGHT", cmd_worker_light),
        # Optional workers — comment out to reduce resource usage:
        ("DOCPROCESSING", cmd_worker_docprocessing),
        ("DOCFETCHING", cmd_worker_docfetching),
        ("HEAVY", cmd_worker_heavy),
        # ("MONITORING", cmd_worker_monitoring),
        ("USER_FILE_PROCESSING", cmd_worker_user_file_processing),
        # ("SCHEDULED_TASKS", cmd_worker_scheduled_tasks),
        ("GRAPH_PROCESSING", cmd_worker_graph_processing),
        ("GRAPH_ACL_PUSH", cmd_worker_graph_acl_push),
        ("BEAT", cmd_beat),
    ]

    # onyx isn't installed into the venv, and celery keeps the cwd on
    # sys.path only transiently while importing the app. Spawn-context
    # children (SimpleJobClient) inherit the worker's sys.path, so pin the
    # backend dir via PYTHONPATH, mirroring the Dockerfile's PYTHONPATH=/app.
    _inherited_pythonpath = os.environ.get("PYTHONPATH")
    worker_env = {
        **os.environ,
        "PYTHONPATH": (
            f"{BACKEND_DIR}{os.pathsep}{_inherited_pythonpath}"
            if _inherited_pythonpath
            else BACKEND_DIR
        ),
    }

    processes = []
    for name, cmd in all_workers:
        process = subprocess.Popen(
            cmd,
            env=worker_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        processes.append((name, process))

    threads = []
    for name, process in processes:
        thread = threading.Thread(target=monitor_process, args=(name, process))
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()


if __name__ == "__main__":
    run_jobs()
