import boto3
import json
import time

ssm = boto3.client('ssm')
ec2 = boto3.client('ec2')

ADMIN_FILE = '/usr/games/serverconfig/valheim/saves/adminlist.txt'

def lambda_handler(event, context):
    tag_key = event['mcTagName']
    tag_value = event['mcTagValue']
    action = event.get('action', '') or 'list'
    steam_id = event.get('steamId', '') or ''

    instance_id = find_instance(tag_key, tag_value)
    if not instance_id:
        return ['No running instance found']

    if action == 'list':
        cmd = f'cat {ADMIN_FILE} 2>/dev/null || echo ""'
    elif action == 'add':
        if not steam_id.isdigit() or len(steam_id) != 17:
            return ['Invalid Steam ID']
        cmd = f'grep -qxF "{steam_id}" {ADMIN_FILE} 2>/dev/null || echo "{steam_id}" >> {ADMIN_FILE}'
    elif action == 'remove':
        if not steam_id.isdigit() or len(steam_id) != 17:
            return ['Invalid Steam ID']
        cmd = f'sed -i "/^{steam_id}$/d" {ADMIN_FILE}'
    else:
        return ['Invalid action']

    result = ssm.send_command(
        InstanceIds=[instance_id],
        DocumentName='AWS-RunShellScript',
        Parameters={'commands': [cmd]},
        TimeoutSeconds=30
    )
    command_id = result['Command']['CommandId']

    for _ in range(10):
        time.sleep(0.2)
        output = ssm.get_command_invocation(
            CommandId=command_id,
            InstanceId=instance_id
        )
        if output['Status'] not in ('Pending', 'InProgress'):
            break

    if action == 'list':
        content = output.get('StandardOutputContent', '')
        ids = [l.strip() for l in content.split('\n') if l.strip() and not l.strip().startswith('//')]
        return ids
    else:
        if output['Status'] == 'Success':
            return [f'Admin {action} successful for {steam_id}']
        else:
            return [f'Admin {action} failed']

def find_instance(tag_key, tag_value):
    response = ec2.describe_instances(
        Filters=[
            {'Name': f'tag:{tag_key}', 'Values': [tag_value]},
            {'Name': 'instance-state-name', 'Values': ['running']}
        ]
    )
    for r in response['Reservations']:
        for i in r['Instances']:
            return i['InstanceId']
    return None
